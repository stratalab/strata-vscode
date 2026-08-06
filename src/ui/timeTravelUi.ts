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
    const choice = await vscode.window.showQuickPick(
      [
        ...(scrubbed ? [{ label: "$(debug-continue) Back to now", action: "now" as const }] : []),
        { label: "$(calendar) Enter a timestamp…", action: "timestamp" as const },
        {
          label: "$(history) Pick from a key's history…",
          description: "use “Key History” on a KV entry or JSON document in the explorer",
          action: "hint" as const,
        },
      ],
      { title: `Time travel — ${dbPath.split("/").pop()}${scrubbed ? " (currently scrubbed)" : ""}` },
    );
    if (!choice) return;
    if (choice.action === "now") {
      this.viewContext.setAsOf(dbPath, null);
      this.manager.poke(dbPath); // re-read once after returning to live (AR-5.3 spirit)
      return;
    }
    if (choice.action === "hint") return;
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
      { title: `History — selecting scrubs the database to that moment` },
    );
    if (!picked) return;
    this.viewContext.setAsOf(scope.dbPath, picked.entry.timestamp);
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
