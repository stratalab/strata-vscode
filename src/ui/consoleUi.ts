/**
 * Console quick-input flows (F3): native palette + generated forms + raw
 * wire-JSON mode. Result tables ride the E8 webview infra in M4; until then
 * results render as virtual JSON documents with explicit page continuation.
 */
import * as vscode from "vscode";
import { COMMANDS, COMMAND_FORMS, type CommandId } from "../generated";
import type { DatabaseManager } from "../attach/manager";
import type { ViewContextStore } from "../state/viewContext";
import { buildPalette, READ_ONLY_REASON, type PaletteItem } from "../console/palette";
import { validatePayload, validateRawCommand } from "../console/validate";
import {
  continuationPayload,
  executeRun,
  planRun,
  renderError,
  renderResult,
  type ConsoleContext,
} from "../console/runner";
import { ConsoleHistoryStore } from "../console/historyStore";
import type { InspectorDocuments } from "./inspectorDoc";

interface CommandQuickPick extends vscode.QuickPickItem {
  item?: PaletteItem;
}

export class ConsoleUi {
  constructor(
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
    private readonly inspectors: InspectorDocuments,
    private readonly history: ConsoleHistoryStore,
  ) {}

  /** F3.1: the searchable palette; writes visible but greyed (AR-4.2). */
  async runCommandFlow(): Promise<void> {
    const dbPath = await this.pickDatabase();
    if (!dbPath) return;

    const palette = buildPalette();
    const items: CommandQuickPick[] = [];
    let family = "";
    for (const item of palette) {
      if (item.family !== family) {
        family = item.family;
        items.push({ label: family, kind: vscode.QuickPickItemKind.Separator });
      }
      items.push({
        label: item.runnable ? item.commandId : `$(lock) ${item.commandId}`,
        description: item.title,
        detail: item.summary + (item.wireOnly ? "  ·  wire-only (no CLI verb)" : ""),
        item,
      });
    }
    const picked = await vscode.window.showQuickPick(items, {
      title: `Strata Console — ${this.describeContext(dbPath)}`,
      placeHolder: "Search by id, title, or summary",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked?.item) return;
    if (!picked.item.runnable) {
      void vscode.window.showInformationMessage(
        `${picked.item.commandId} is write-classified — ${READ_ONLY_REASON}.`,
      );
      return;
    }
    await this.formFlow(dbPath, picked.item.commandId);
  }

  /** F3.2 form mode: quick inputs generated from the schema field specs. */
  private async formFlow(dbPath: string, commandId: CommandId): Promise<void> {
    const spec = COMMAND_FORMS[commandId];
    const payload: Record<string, unknown> = {};

    for (const field of spec.fields) {
      const promptBase = `${commandId} · ${field.name}${field.required ? "" : " (optional, Enter to skip)"}`;
      if (field.kind === "enum") {
        const choice = await vscode.window.showQuickPick(
          [...(field.enumValues ?? []), ...(field.required ? [] : ["(skip)"])],
          { title: promptBase, placeHolder: field.description },
        );
        if (choice === undefined) return; // cancelled
        if (choice !== "(skip)") payload[field.name] = choice;
        continue;
      }
      if (field.kind === "boolean") {
        const choice = await vscode.window.showQuickPick(
          ["true", "false", ...(field.required ? [] : ["(skip)"])],
          { title: promptBase, placeHolder: field.description },
        );
        if (choice === undefined) return;
        if (choice !== "(skip)") payload[field.name] = choice === "true";
        continue;
      }
      const raw = await vscode.window.showInputBox({
        title: promptBase,
        prompt:
          field.kind === "bytes"
            ? `${field.description} — plain text (encoded to base64 for the wire, AR-1.7)`
            : field.description,
        validateInput: (value) => this.validateFieldInput(field.kind, field.required, value),
      });
      if (raw === undefined) return; // cancelled
      if (raw === "") continue; // optional skipped
      payload[field.name] = this.parseFieldInput(field.kind, raw);
    }

    const errors = validatePayload(commandId, payload);
    if (errors.length > 0) {
      void vscode.window.showErrorMessage(`StrataDB console: ${errors.join("; ")}`);
      return;
    }
    await this.execute(dbPath, commandId, payload);
  }

  private validateFieldInput(kind: string, required: boolean, value: string): string | null {
    if (value === "") return required ? "required" : null;
    if (kind === "number" && Number.isNaN(Number(value))) return "must be a number";
    if (kind === "json") {
      try {
        JSON.parse(value);
      } catch {
        return "must be valid JSON";
      }
    }
    return null;
  }

  private parseFieldInput(kind: string, raw: string): unknown {
    switch (kind) {
      case "number":
        return Number(raw);
      case "json":
        return JSON.parse(raw);
      case "bytes":
        return Buffer.from(raw, "utf8").toString("base64");
      default:
        return raw;
    }
  }

  /** F3.2 raw mode: an editable wire-JSON document, validated before send. */
  async rawRequestFlow(): Promise<void> {
    const dbPath = await this.pickDatabase();
    if (!dbPath) return;
    const palette = buildPalette().filter((p) => p.runnable);
    const picked = await vscode.window.showQuickPick(
      palette.map((p) => ({ label: p.commandId, description: p.title, item: p })),
      { title: "Raw wire request — pick a command for its skeleton", matchOnDescription: true },
    );
    if (!picked) return;
    const spec = COMMAND_FORMS[picked.item.commandId];
    const skeleton =
      spec.example ?? JSON.stringify({ type: COMMANDS[picked.item.commandId].wireType });
    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(JSON.parse(skeleton), null, 2),
    });
    await vscode.window.showTextDocument(document);
    void vscode.window.showInformationMessage(
      "Edit the wire command, then run “Strata: Send Raw Request” with this editor active.",
      { modal: false },
    );
  }

  async sendRawFlow(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editor.document.getText());
    } catch (error) {
      void vscode.window.showErrorMessage(`StrataDB console: not valid JSON — ${String(error)}`);
      return;
    }
    const verdict = validateRawCommand(parsed);
    if (verdict.commandId === null || verdict.errors.length > 0) {
      void vscode.window.showErrorMessage(`StrataDB console: ${verdict.errors.join("; ")}`);
      return;
    }
    const dbPath = await this.pickDatabase();
    if (!dbPath) return;
    const { type: _tag, ...payload } = parsed as Record<string, unknown>;
    await this.execute(dbPath, verdict.commandId, payload);
  }

  /** F3.6: replayable history. */
  async historyFlow(): Promise<void> {
    const entries = this.history.list();
    if (entries.length === 0) {
      void vscode.window.showInformationMessage("StrataDB console: no history yet.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      entries.map((entry, at) => ({
        label: entry.commandId,
        description: `${entry.branch}${entry.space ? ` / ${entry.space}` : ""} · ${entry.at}`,
        detail: JSON.stringify(entry.payload),
        at,
      })),
      { title: "Console history — Enter to replay", matchOnDetail: true },
    );
    if (!picked) return;
    const entry = entries[picked.at]!;
    const dbPath = await this.pickDatabase();
    if (!dbPath) return;
    await this.execute(dbPath, entry.commandId, entry.payload);
  }

  private async execute(
    dbPath: string,
    commandId: CommandId,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const session = this.manager.session(dbPath);
    if (!session) {
      void vscode.window.showWarningMessage("StrataDB console: that database is not attached.");
      return;
    }
    const context: ConsoleContext = {
      branch: this.viewContext.branchFor(dbPath),
      asOfMicros: this.viewContext.asOfFor(dbPath),
    };
    const run = planRun(commandId, payload, context);

    // F3.4: expensive kinds hold the single execution lane — say so first.
    if (run.needsConfirmation) {
      const go = await vscode.window.showWarningMessage(
        `${commandId} is an expensive command: it holds the database's single execution lane while it runs ` +
          `(deadline ${Math.round(run.deadlineMs / 1000)}s). The owning app's work queues behind it.`,
        { modal: true },
        "Run",
      );
      if (go !== "Run") return;
    }

    this.history.record({
      commandId,
      payload,
      branch: context.branch,
      at: new Date().toISOString(),
    });

    try {
      const response = await executeRun(session.client, run, context);
      await this.inspectors.open(`console: ${commandId}`, renderResult(run, context, response));
      const next = continuationPayload(commandId, payload, response);
      if (next) {
        const more = await vscode.window.showInformationMessage(
          `${commandId}: more results available.`,
          "Load next page",
        );
        if (more) await this.execute(dbPath, commandId, next);
      }
    } catch (error) {
      // F3.5: the full envelope, docs link included — never a bare toast.
      await this.inspectors.open(`console error: ${commandId}`, renderError(run, error));
    }
  }

  private describeContext(dbPath: string): string {
    const branch = this.viewContext.branchFor(dbPath);
    const asOf = this.viewContext.describeAsOf(dbPath);
    return `${dbPath.split("/").pop()} @ ${branch}${asOf ? ` ⏪ ${asOf}` : ""}`;
  }

  private async pickDatabase(): Promise<string | null> {
    const attached = this.manager.list().filter((e) => this.manager.session(e.dbPath));
    if (attached.length === 0) {
      void vscode.window.showWarningMessage("StrataDB console: no attached databases.");
      return null;
    }
    if (attached.length === 1) return attached[0]!.dbPath;
    const picked = await vscode.window.showQuickPick(
      attached.map((e) => ({ label: e.dbPath.split("/").pop() ?? e.dbPath, description: e.dbPath })),
      { title: "Which database?" },
    );
    return picked?.description ?? null;
  }
}
