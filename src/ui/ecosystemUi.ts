/**
 * M5 flows: clone-from-hub (F5) and MCP agent enablement (F6). Both execute
 * or reference the strata binary, so both are trusted-workspace only
 * (AR-7.5) with stated reasons, never silent no-ops.
 */
import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { runClone } from "../hub/clone";
import {
  applyStrataEntries,
  buildStrataEntries,
  removeStrataEntries,
  type WriteOutcome,
} from "../mcp/registration";
import type { DatabaseManager } from "../attach/manager";

const CONSENT_KEY = "strata.mcpAgentConsent"; // "always" | "never" (machine-level, F6.2)

export class EcosystemUi {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DatabaseManager,
    private readonly binary: string | null,
  ) {}

  // ------------------------------------------------------------------ F5

  async cloneFlow(): Promise<void> {
    if (!this.requireTrust("Clone spawns the strata binary")) return;
    if (!this.binary) {
      void vscode.window.showWarningMessage("StrataDB: no strata binary — set strata.binaryPath.");
      return;
    }
    const dataset = await vscode.window.showInputBox({
      title: "Clone dataset from StrataHub",
      prompt: "Dataset slug (e.g. examples/wiki-graph)",
    });
    if (!dataset) return;
    const branch = await vscode.window.showInputBox({
      title: "Branch (optional)",
      prompt: "Empty for the dataset's default branch",
    });
    if (branch === undefined) return;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const defaultDest = path.join(workspaceRoot, `${dataset.split("/").pop()}.strata`);
    const dest = await vscode.window.showInputBox({
      title: "Destination directory",
      value: defaultDest,
    });
    if (!dest) return;
    const hubUrl = await vscode.window.showInputBox({
      title: "Hub URL override (optional)",
      prompt: "Empty follows the CLI's resolution: --hub, STRATA_HUB_URL, then config",
    });
    if (hubUrl === undefined) return;

    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Cloning ${dataset} from StrataHub…` },
      () =>
        runClone(this.binary!, {
          dataset,
          dest,
          ...(branch ? { branch } : {}),
          ...(hubUrl ? { hubUrl } : {}),
        }),
    );

    if (result.ok) {
      const open = await vscode.window.showInformationMessage(
        `StrataDB: cloned ${dataset} into ${dest}.`,
        "Open in Explorer",
      );
      if (open) {
        const config = vscode.workspace.getConfiguration("strata");
        const explicit = config.get<string[]>("databases", []);
        if (!explicit.includes(dest) && !dest.startsWith(workspaceRoot)) {
          await config.update("databases", [...explicit, dest], vscode.ConfigurationTarget.Workspace);
        }
        await vscode.commands.executeCommand("strata.refreshDatabases");
      }
      return;
    }

    // F5.3: registry hint + docs link, keyed by code.
    const error = result.error;
    const actions = [
      ...(error.docsUrl ? ["Open Docs"] : []),
      ...(error.retryable ? ["Retry"] : []),
    ];
    const choice = await vscode.window.showErrorMessage(
      `StrataDB clone failed (${error.code}): ${error.message}${error.suggestedFix ? ` — ${error.suggestedFix}` : ""}`,
      ...actions,
    );
    if (choice === "Open Docs" && error.docsUrl) {
      void vscode.env.openExternal(vscode.Uri.parse(error.docsUrl));
    } else if (choice === "Retry") {
      await this.cloneFlow();
    }
  }

  // ------------------------------------------------------------------ F6

  /** F6.1: the VS Code-native provider — on by default, editor-managed consent. */
  registerNativeProvider(): void {
    const lm = (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable } }).lm;
    if (!lm?.registerMcpServerDefinitionProvider) return; // fork without the API — F6.2 covers it
    if (!vscode.workspace.isTrusted || !this.binary) return;
    const emitter = new vscode.EventEmitter<void>();
    this.manager.onDidChange(() => emitter.fire());
    const McpStdio = (vscode as unknown as Record<string, unknown>).McpStdioServerDefinition as
      | (new (label: string, command: string, args: string[]) => unknown)
      | undefined;
    if (!McpStdio) return;
    const disposable = lm.registerMcpServerDefinitionProvider("strata", {
      onDidChangeMcpServerDefinitions: emitter.event,
      provideMcpServerDefinitions: () => {
        const entries = buildStrataEntries(this.dbPaths(), this.binary!);
        return Object.entries(entries).map(([name, entry]) => new McpStdio!(name, entry.command, entry.args));
      },
    });
    this.context.subscriptions.push(disposable, emitter);
  }

  /** F6.2: one machine-level consent, then automatic per-workspace writes. */
  async autoRegisterFileAgents(): Promise<void> {
    if (!vscode.workspace.isTrusted || !this.binary) return;
    if (this.dbPaths().length === 0) return;
    let consent = this.context.globalState.get<"always" | "never">(CONSENT_KEY);
    if (consent === undefined) {
      const answer = await vscode.window.showInformationMessage(
        "Register Strata with AI agents automatically? This writes MCP entries to .mcp.json and .cursor/mcp.json in workspaces that contain a Strata database.",
        "Always",
        "Never",
      );
      if (answer === undefined) return; // ask again next activation
      consent = answer === "Always" ? "always" : "never";
      await this.context.globalState.update(CONSENT_KEY, consent);
    }
    if (consent === "always") this.writeRegistrations(false);
  }

  /** Manual registration — also the escape hatch after a "Never". */
  registerAgentsCommand(): void {
    if (!this.requireTrust("Agent registration writes entries that execute the strata binary")) return;
    if (!this.binary) {
      void vscode.window.showWarningMessage("StrataDB: no strata binary — set strata.binaryPath.");
      return;
    }
    this.writeRegistrations(true);
  }

  removeAgentsCommand(): void {
    const results = this.eachConfigFile((existing) => removeStrataEntries(existing));
    this.report("removed", results, true);
  }

  private writeRegistrations(verbose: boolean): void {
    const entries = buildStrataEntries(this.dbPaths(), this.binary!);
    if (Object.keys(entries).length === 0) {
      if (verbose) void vscode.window.showInformationMessage("StrataDB: no databases to register.");
      return;
    }
    const results = this.eachConfigFile((existing) => applyStrataEntries(existing, entries));
    this.report("registered", results, verbose);
  }

  private configPaths(): string[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return [];
    return [path.join(root, ".mcp.json"), path.join(root, ".cursor", "mcp.json")];
  }

  private eachConfigFile(
    transform: (existing: string | null) => WriteOutcome,
  ): Array<{ file: string; outcome: WriteOutcome }> {
    return this.configPaths().map((file) => {
      const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      const outcome = transform(existing);
      if (outcome.kind === "updated") {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, outcome.content);
      }
      return { file, outcome };
    });
  }

  private report(
    verb: string,
    results: Array<{ file: string; outcome: WriteOutcome }>,
    verbose: boolean,
  ): void {
    const refused = results.filter((r) => r.outcome.kind === "refused");
    for (const r of refused) {
      void vscode.window.showWarningMessage(
        `StrataDB: left ${r.file} untouched — ${(r.outcome as { reason: string }).reason}`,
      );
    }
    const updated = results.filter((r) => r.outcome.kind === "updated");
    if (verbose && updated.length > 0) {
      void vscode.window.showInformationMessage(
        `StrataDB: ${verb} agent entries in ${updated.map((r) => path.basename(path.dirname(r.file)) === ".cursor" ? ".cursor/mcp.json" : path.basename(r.file)).join(" and ")}.`,
      );
    }
  }

  private dbPaths(): string[] {
    return this.manager
      .list()
      .filter((entry) => entry.state.kind === "attachable" || entry.state.kind === "unowned")
      .map((entry) => entry.dbPath);
  }

  private requireTrust(why: string): boolean {
    if (vscode.workspace.isTrusted) return true;
    void vscode.window.showWarningMessage(
      `StrataDB: ${why}; this workspace is untrusted, so StrataDB stays attach-only (AR-7.5).`,
    );
    return false;
  }
}
