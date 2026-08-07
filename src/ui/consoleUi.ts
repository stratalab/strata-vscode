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
import { formatMicros } from "../views/shared/format";

interface CommandQuickPick extends vscode.QuickPickItem {
  item?: PaletteItem;
}

/** CN-2: the palette speaks the same icon language as the tree. */
const FAMILY_ICONS: Record<string, string> = {
  kv: "symbol-key",
  json: "json",
  event: "pulse",
  vector: "symbol-array",
  graph: "type-hierarchy",
  branch: "git-branch",
  space: "folder",
  admin: "gear",
  arrow: "table",
};
function familyIcon(family: string): string {
  return FAMILY_ICONS[family] ?? "symbol-method";
}

/** Multi-step quick-input primitives (CN-1): Back navigates, Escape cancels. */
const BACK = Symbol("back");
type StepResult<T> = T | typeof BACK | undefined;

function stepInputBox(options: {
  title: string;
  step: number;
  totalSteps: number;
  prompt: string;
  value: string;
  validate: (value: string) => string | null;
}): Promise<StepResult<string>> {
  return new Promise((resolve) => {
    const input = vscode.window.createInputBox();
    input.title = options.title;
    input.step = options.step;
    input.totalSteps = options.totalSteps;
    input.prompt = options.prompt;
    input.value = options.value;
    input.ignoreFocusOut = true;
    if (options.step > 1) input.buttons = [vscode.QuickInputButtons.Back];
    let done = false;
    input.onDidChangeValue((value) => {
      input.validationMessage = options.validate(value) ?? undefined;
    });
    input.onDidTriggerButton((button) => {
      if (button === vscode.QuickInputButtons.Back) {
        done = true;
        resolve(BACK);
        input.hide();
      }
    });
    input.onDidAccept(() => {
      const message = options.validate(input.value);
      if (message !== null) {
        input.validationMessage = message;
        return;
      }
      done = true;
      resolve(input.value);
      input.hide();
    });
    input.onDidHide(() => {
      if (!done) resolve(undefined);
      input.dispose();
    });
    input.show();
  });
}

function stepPick<T extends vscode.QuickPickItem>(options: {
  title: string;
  step: number;
  totalSteps: number;
  placeholder: string;
  items: T[];
  active?: T;
}): Promise<StepResult<T>> {
  return new Promise((resolve) => {
    const pick = vscode.window.createQuickPick<T>();
    pick.title = options.title;
    pick.step = options.step;
    pick.totalSteps = options.totalSteps;
    pick.placeholder = options.placeholder;
    pick.items = options.items;
    pick.ignoreFocusOut = true;
    if (options.active) pick.activeItems = [options.active];
    if (options.step > 1) pick.buttons = [vscode.QuickInputButtons.Back];
    let done = false;
    pick.onDidTriggerButton((button) => {
      if (button === vscode.QuickInputButtons.Back) {
        done = true;
        resolve(BACK);
        pick.hide();
      }
    });
    pick.onDidAccept(() => {
      done = true;
      resolve(pick.selectedItems[0]);
      pick.hide();
    });
    pick.onDidHide(() => {
      if (!done) resolve(undefined);
      pick.dispose();
    });
    pick.show();
  });
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
        label: item.runnable
          ? `$(${familyIcon(item.family)}) ${item.commandId}`
          : `$(lock) ${item.commandId}`,
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

  /** F3.2 form mode, multi-step (CN-1): numbered steps with Back, then a
   * final summary showing the exact wire JSON before anything is sent. */
  private async formFlow(dbPath: string, commandId: CommandId): Promise<void> {
    const fields = COMMAND_FORMS[commandId].fields;
    const totalSteps = fields.length + 1;
    const raw: string[] = fields.map(() => "");
    let index = 0;

    while (index <= fields.length) {
      if (index === fields.length) {
        // Summary step: see precisely what leaves the editor (CN-1).
        const payload = this.buildPayload(commandId, raw);
        const errors = validatePayload(commandId, payload);
        if (errors.length > 0) {
          void vscode.window.showErrorMessage(`StrataDB: ${errors.join("; ")}`);
          if (fields.length === 0) return;
          index = fields.length - 1;
          continue;
        }
        const context: ConsoleContext = {
          branch: this.viewContext.branchFor(dbPath),
          asOfMicros: this.viewContext.asOfFor(dbPath),
        };
        const wire = JSON.stringify(planRun(commandId, payload, context).wireCommand);
        interface SummaryItem extends vscode.QuickPickItem {
          action: "send" | "raw";
        }
        const picked = await stepPick<SummaryItem>({
          title: `${commandId} — review and send`,
          step: totalSteps,
          totalSteps,
          placeholder: `Runs on ${this.describeContext(dbPath)}`,
          items: [
            { label: "$(check) Send", detail: wire, action: "send" },
            {
              label: "$(json) Edit as a raw wire request…",
              description: "opens the full JSON in an editor",
              action: "raw",
            },
          ],
        });
        if (picked === undefined) return;
        if (picked === BACK) {
          index = fields.length - 1;
          continue;
        }
        if (picked.action === "raw") {
          await this.openRawDocument(wire);
          return;
        }
        await this.execute(dbPath, commandId, payload);
        return;
      }

      const field = fields[index]!;
      const step = index + 1;
      const title = `${commandId} · ${field.name}${field.required ? "" : " (optional)"}`;
      if (field.kind === "enum" || field.kind === "boolean") {
        const choices = field.kind === "boolean" ? ["true", "false"] : (field.enumValues ?? []);
        interface Choice extends vscode.QuickPickItem {
          value: string;
        }
        const items: Choice[] = [
          ...choices.map((choice) => ({ label: choice, value: choice })),
          ...(field.required
            ? []
            : [{ label: "$(circle-slash) Skip", description: "leave unset", value: "" }]),
        ];
        const previous = items.find((i) => i.value === raw[index] && i.value !== "");
        const picked = await stepPick<Choice>({
          title,
          step,
          totalSteps,
          placeholder: field.description,
          items,
          ...(previous ? { active: previous } : {}),
        });
        if (picked === undefined) return;
        if (picked === BACK) {
          index -= 1;
          continue;
        }
        raw[index] = picked.value;
        index += 1;
        continue;
      }
      const value = await stepInputBox({
        title,
        step,
        totalSteps,
        prompt:
          field.kind === "bytes"
            ? `${field.description} — plain text (encoded to base64 for the wire, AR-1.7)`
            : `${field.description}${field.required ? "" : " — Enter to skip"}`,
        value: raw[index]!,
        validate: (v) => this.validateFieldInput(field.kind, field.required, v),
      });
      if (value === undefined) return;
      if (value === BACK) {
        index -= 1;
        continue;
      }
      raw[index] = value;
      index += 1;
    }
  }

  private buildPayload(commandId: CommandId, raw: string[]): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    COMMAND_FORMS[commandId].fields.forEach((field, i) => {
      const value = raw[i]!;
      if (value === "") return;
      if (field.kind === "boolean") payload[field.name] = value === "true";
      else payload[field.name] = this.parseFieldInput(field.kind, value);
    });
    return payload;
  }

  private async openRawDocument(wire: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(JSON.parse(wire), null, 2),
    });
    await vscode.window.showTextDocument(document);
    void vscode.window.showInformationMessage(
      "Edit the wire command, then run “Strata: Send Raw Request” with this editor active.",
    );
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
      palette.map((p) => ({
        label: `$(${familyIcon(p.family)}) ${p.commandId}`,
        description: p.title,
        item: p,
      })),
      { title: "Raw wire request — pick a command for its skeleton", matchOnDescription: true },
    );
    if (!picked) return;
    const spec = COMMAND_FORMS[picked.item.commandId];
    const skeleton =
      spec.example ?? JSON.stringify({ type: COMMANDS[picked.item.commandId].wireType });
    await this.openRawDocument(skeleton);
  }

  async sendRawFlow(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editor.document.getText());
    } catch (error) {
      void vscode.window.showErrorMessage(`StrataDB: not valid JSON — ${String(error)}`);
      return;
    }
    const verdict = validateRawCommand(parsed);
    if (verdict.commandId === null || verdict.errors.length > 0) {
      void vscode.window.showErrorMessage(`StrataDB: ${verdict.errors.join("; ")}`);
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
      void vscode.window.showInformationMessage("StrataDB: no console runs yet.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      entries.map((entry, at) => {
        const preview = JSON.stringify(entry.payload);
        return {
          label: entry.commandId,
          description: `${formatMicros(Date.parse(entry.at) * 1000)} · ${entry.branch}${entry.space ? ` / ${entry.space}` : ""}`,
          detail: preview.length > 120 ? `${preview.slice(0, 120)}…` : preview,
          at,
        };
      }),
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
      void vscode.window.showWarningMessage("StrataDB: that database isn't attached.");
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
      await this.inspectors.open(`${commandId} — result`, renderResult(run, context, response));
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
      await this.inspectors.open(`${commandId} — error`, renderError(run, error));
    }
  }

  private describeContext(dbPath: string): string {
    const branch = this.viewContext.branchFor(dbPath);
    const asOf = this.viewContext.describeAsOf(dbPath);
    return `${dbPath.split("/").pop()} · ${branch}${asOf ? ` · as of ${asOf}` : ""}`;
  }

  private async pickDatabase(): Promise<string | null> {
    const attached = this.manager.list().filter((e) => this.manager.session(e.dbPath));
    if (attached.length === 0) {
      void vscode.window.showWarningMessage("StrataDB: no databases are attached.");
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
