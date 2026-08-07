/**
 * Time travel and branch flows (F2): the branch picker, the scrubber, key
 * history timelines that drive it, and cross-branch comparison rendered as a
 * native side-by-side diff.
 */
import * as vscode from "vscode";
import type { DatabaseManager } from "../attach/manager";
import type { ViewContextStore } from "../state/viewContext";
import { kvTimeline, jsonTimeline, type TimelineResult } from "../explorer/history";
import { compareJsonAcrossBranches, compareKvAcrossBranches } from "../explorer/compare";
import type { ExplorerNode } from "../explorer/model";
import type { InspectorDocuments } from "./inspectorDoc";
import { parseTimestampMicros } from "../explorer/time";
import { formatMicros } from "../views/shared/format";
import { keyLabel } from "../explorer/decode";
import type { WireBase64 } from "../wire/bytes";

export class TimeTravelUi {
  constructor(
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
    private readonly inspectors: InspectorDocuments,
  ) {}

  /** F2.1: branch picker scoped per database; the selection persists (AR-8.3). */
  async selectBranchFlow(dbPath: string): Promise<void> {
    const session = this.manager.session(dbPath);
    if (!session) return;
    const current = this.viewContext.branchFor(dbPath);
    const response = await session.client.request("branch.list", {}, { branch: current });
    const picked = await vscode.window.showQuickPick(
      response.data.items.map((item) => ({
        label: item.name === current ? `$(circle-filled) ${item.name}` : item.name,
        description: `${String(item.status)} · generation ${item.generation}`,
        branch: item.name,
      })),
      { title: `Select branch — ${dbPath.split("/").pop()}` },
    );
    if (!picked) return;
    this.viewContext.setBranch(dbPath, picked.branch);
  }

  /** F2.2: the scrubber — set or clear the as_of position. */
  async timeTravelFlow(dbPath: string): Promise<void> {
    const scrubbed = this.viewContext.isScrubbed(dbPath);
    const asOf = this.viewContext.describeAsOf(dbPath);
    const choice = await vscode.window.showQuickPick(
      [
        ...(scrubbed ? [{ label: "$(debug-continue) Back to now", action: "now" as const }] : []),
        { label: "$(calendar) Enter a timestamp…", action: "timestamp" as const },
        {
          label: "$(history) Pick from a key's history…",
          description: "browse a key or document's layers, then scrub to one",
          action: "pick" as const,
        },
      ],
      { title: `Time travel — ${dbPath.split("/").pop()}${asOf ? ` · as of ${asOf}` : ""}` },
    );
    if (!choice) return;
    if (choice.action === "now") {
      this.viewContext.setAsOf(dbPath, null);
      this.manager.poke(dbPath); // re-read once after returning to live (AR-5.3 spirit)
      return;
    }
    if (choice.action === "pick") {
      await this.pickFromHistoryFlow(dbPath);
      return;
    }
    const raw = await vscode.window.showInputBox({
      title: "Scrub to…",
      prompt: "ISO time (2026-08-05T12:00:00Z), unix seconds/millis/micros — reads will use as_of",
      validateInput: (value) => (parseTimestampMicros(value) === null ? "unrecognized time" : null),
    });
    if (raw === undefined) return;
    const micros = parseTimestampMicros(raw);
    if (micros !== null) this.viewContext.setAsOf(dbPath, micros);
  }

  /** F2.3: the per-key timeline; selecting an entry drives the scrubber. */
  async keyHistoryFlow(node: ExplorerNode): Promise<void> {
    if (node.type !== "kv-entry" && node.type !== "json-doc") return;
    const scope = node.scope;
    const session = this.manager.session(scope.dbPath);
    if (!session) return;

    const timeline: TimelineResult =
      node.type === "kv-entry"
        ? await kvTimeline(session.client, scope, node.key)
        : await jsonTimeline(session.client, scope, node.docId);

    await this.scrubFromTimeline(scope.dbPath, timeline);
  }

  /** TT-1: the palette path — pick a key or document, then one of its
   * layers; the selection drives the scrubber like the explorer path does. */
  private async pickFromHistoryFlow(dbPath: string): Promise<void> {
    const session = this.manager.session(dbPath);
    if (!session) return;
    const branch = this.viewContext.branchFor(dbPath);
    const scope = { dbPath, branch, space: "default" };
    const [keys, docs] = await Promise.all([
      session.client
        .request("kv.scan", { limit: 100 }, { branch, space: scope.space })
        .then((r) => r.data.items.map((item) => item.key))
        .catch(() => [] as WireBase64[]),
      session.client
        .request("json.list", {}, { branch, space: scope.space })
        .then((r) => r.data.items)
        .catch(() => [] as string[]),
    ]);
    type PickTarget = { type: "kv"; key: WireBase64 } | { type: "doc"; docId: string };
    type PickItem = vscode.QuickPickItem & { target?: PickTarget };
    const items: PickItem[] = [];
    if (keys.length > 0) {
      items.push({ label: "Key-Value", kind: vscode.QuickPickItemKind.Separator });
      for (const key of keys) {
        items.push({ label: `$(symbol-key) ${keyLabel(key)}`, target: { type: "kv", key } });
      }
    }
    if (docs.length > 0) {
      items.push({ label: "Documents", kind: vscode.QuickPickItemKind.Separator });
      for (const docId of docs) {
        items.push({ label: `$(json) ${docId}`, target: { type: "doc", docId } });
      }
    }
    if (items.length === 0) {
      void vscode.window.showInformationMessage(
        "StrataDB: nothing to pick from — this space has no keys or documents yet.",
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(items, {
      title: "Whose history?",
      placeHolder: "Pick a key or document to browse its layers",
    });
    if (!picked?.target) return;
    const timeline =
      picked.target.type === "kv"
        ? await kvTimeline(session.client, scope, picked.target.key)
        : await jsonTimeline(session.client, scope, picked.target.docId);
    await this.scrubFromTimeline(dbPath, timeline);
  }

  /** F2.3's shared tail: one layer picked from a timeline moves the scrubber. */
  private async scrubFromTimeline(dbPath: string, timeline: TimelineResult): Promise<void> {
    if (timeline.kind === "unavailable") {
      // F2.5: a first-class state, not an error toast.
      void vscode.window.showInformationMessage(
        `History unavailable: ${timeline.reason}`,
        { modal: false },
      );
      return;
    }
    if (timeline.entries.length === 0) {
      void vscode.window.showInformationMessage("No retained versions for this item.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      timeline.entries.map((entry) => ({
        label: `v${entry.version}${entry.tombstone ? " $(trash) deleted" : ""}`,
        description: formatMicros(entry.timestamp),
        detail: entry.preview ?? undefined,
        entry,
      })),
      { title: "History — selecting scrubs the database to that moment" },
    );
    if (!picked) return;
    this.viewContext.setAsOf(dbPath, picked.entry.timestamp);
  }

  /** F2.4: side-by-side branch comparison via the native diff editor. */
  async compareBranchesFlow(node: ExplorerNode): Promise<void> {
    if (node.type !== "kv-entry" && node.type !== "json-doc") return;
    const scope = node.scope;
    const session = this.manager.session(scope.dbPath);
    if (!session) return;

    const branches = await session.client.request("branch.list", {}, { branch: scope.branch });
    const others = branches.data.items.map((b) => b.name).filter((name) => name !== scope.branch);
    if (others.length === 0) {
      void vscode.window.showInformationMessage("Only one branch exists — nothing to compare.");
      return;
    }
    const other = await vscode.window.showQuickPick(others, {
      title: `Compare ${scope.branch} against…`,
    });
    if (!other) return;

    const comparison =
      node.type === "kv-entry"
        ? await compareKvAcrossBranches(session.client, scope, node.key, other)
        : await compareJsonAcrossBranches(session.client, scope, node.docId, other);

    const leftUri = this.inspectors.register(
      `${comparison.left.title} @ ${comparison.left.branch}`,
      comparison.left.content,
    );
    const rightUri = this.inspectors.register(
      `${comparison.right.title} @ ${comparison.right.branch}`,
      comparison.right.content,
    );
    await vscode.commands.executeCommand(
      "vscode.diff",
      leftUri,
      rightUri,
      `${comparison.left.branch} ⟷ ${comparison.right.branch}`,
    );
  }
}
