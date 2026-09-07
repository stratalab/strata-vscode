import * as vscode from "vscode";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { DatabaseManager, DatabaseEntry } from "../attach/manager";
import { describeState } from "../attach/attachment";
import type { ViewContextStore } from "../state/viewContext";
import { buildViewHtml } from "./viewHtml";
import {
  DEFAULT_HUB_URL,
  firstJsonObject,
  normalizeHubUrl,
  type EffectiveHub,
} from "../hub/catalog";
import {
  buildStrataEntries,
  MCP_AGENT_CONSENT_KEY,
} from "../mcp/registration";
import { inspectMcpConfig } from "../mcp/status";
import type { ClientIdentity } from "../wire/protocol";
import type {
  BinaryStatus,
  HubStatus,
  McpFileStatus,
  McpStatus,
  StatusAction,
  StatusCenterData,
  StatusCenterOp,
  StatusDatabase,
  StatusFix,
  StatusToExt,
  TrustStatus,
} from "../status/shared";

const execFileAsync = promisify(execFile);
const STATUS_TIMEOUT_MS = 4_000;

export interface StatusCenterActions {
  registerAgents(): unknown;
  removeAgentRegistrations(): unknown;
  connectDatabase(): unknown;
  createDatabase(): unknown;
  browseHub(): unknown;
}

export class StatusCenterHost {
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly binary: string | null,
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
    private readonly identity: ClientIdentity,
    private readonly actions: StatusCenterActions,
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      void this.sendSnapshot();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "strataStatusCenter",
      "Strata Status",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "dist"),
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
        retainContextWhenHidden: true,
      },
    );
    panel.iconPath = {
      light: vscode.Uri.joinPath(this.context.extensionUri, "media", "strata.svg"),
      dark: vscode.Uri.joinPath(this.context.extensionUri, "media", "strata.svg"),
    };
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "status", "main.js"),
    );
    const fontUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "views", "codicon.ttf"),
    );
    panel.webview.html = buildViewHtml(panel.webview.cspSource, scriptUri.toString(), fontUri.toString());
    panel.webview.onDidReceiveMessage((message: StatusToExt) => {
      if (message.kind === "ready") {
        void this.respond(panel, 0, { op: "bootstrap" });
        return;
      }
      if (message.kind === "request") {
        void this.respond(panel, message.reqId, message.payload);
      }
    });
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = null;
    });
    this.panel = panel;
  }

  private async sendSnapshot(): Promise<void> {
    if (!this.panel) return;
    await this.respond(this.panel, 0, { op: "bootstrap" });
  }

  private async respond(panel: vscode.WebviewPanel, reqId: number, op: StatusCenterOp): Promise<void> {
    try {
      const data = await this.handle(op);
      void panel.webview.postMessage({ kind: "response", reqId, ok: true, data });
    } catch (error) {
      void panel.webview.postMessage({
        kind: "response",
        reqId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handle(op: StatusCenterOp): Promise<StatusCenterData | null> {
    switch (op.op) {
      case "bootstrap":
        return this.collect();
      case "refresh":
        await this.manager.refresh();
        return this.collect();
      case "open-settings":
      case "manage-trust":
      case "connect-database":
      case "create-database":
      case "browse-hub":
      case "register-agents":
      case "remove-agent-registrations":
      case "open-explorer":
      case "open-file":
        await this.runAction(op);
        return this.collect();
    }
  }

  private async runAction(action: StatusAction): Promise<void> {
    switch (action.op) {
      case "open-settings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "strata.binaryPath");
        return;
      case "manage-trust":
        await vscode.commands.executeCommand("workbench.trust.manage");
        return;
      case "connect-database":
        await this.actions.connectDatabase();
        return;
      case "create-database":
        await this.actions.createDatabase();
        return;
      case "browse-hub":
        await this.actions.browseHub();
        return;
      case "register-agents":
        await this.actions.registerAgents();
        return;
      case "remove-agent-registrations":
        await this.actions.removeAgentRegistrations();
        return;
      case "open-explorer":
        await vscode.commands.executeCommand("workbench.view.extension.strata");
        return;
      case "open-file": {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(action.file));
        await vscode.window.showTextDocument(doc);
        return;
      }
    }
  }

  private async collect(): Promise<StatusCenterData> {
    const databases = await Promise.all(
      this.manager.list().map((entry) => this.collectDatabase(entry)),
    );
    const binary = await this.binaryStatus();
    const trust = trustStatus();
    const hub = await this.hubStatus();
    const mcp = this.mcpStatus(databases);
    return {
      generatedAt: new Date().toISOString(),
      workspace: workspaceStatus(),
      binary,
      trust,
      hub,
      databases,
      mcp,
      fixes: suggestedFixes(binary, trust, databases, mcp),
    };
  }

  private async binaryStatus(): Promise<BinaryStatus> {
    if (!this.binary) {
      return {
        found: false,
        path: null,
        version: null,
        level: "bad",
        message: "No Strata binary was found on PATH or in strata.binaryPath.",
      };
    }
    try {
      const { stdout, stderr } = await execFileAsync(this.binary, ["--version"], {
        encoding: "utf8",
        timeout: STATUS_TIMEOUT_MS,
      });
      const version = firstLine(`${stdout}\n${stderr}`) ?? "version unavailable";
      return {
        found: true,
        path: this.binary,
        version,
        level: "ok",
        message: "Strata CLI is available.",
      };
    } catch (error) {
      return {
        found: true,
        path: this.binary,
        version: null,
        level: "warn",
        message: `Strata binary was found but version probing failed: ${String(error)}`,
      };
    }
  }

  private async collectDatabase(entry: DatabaseEntry): Promise<StatusDatabase> {
    const branch = this.viewContext.branchFor(entry.dbPath);
    const session = this.manager.session(entry.dbPath);
    const base = {
      dbPath: entry.dbPath,
      name: path.basename(entry.dbPath),
      stateKind: entry.disconnected ? "disconnected" : entry.state.kind,
      stateDescription: entry.disconnected ? "disconnected" : describeState(entry.state),
      connected: session !== undefined,
      managed: entry.managed,
      disconnected: entry.disconnected,
      branch,
      scrubbedTo: this.viewContext.describeAsOf(entry.dbPath),
    };
    if (!session) {
      return { ...base, health: null, info: null, ipcStatus: null, error: null };
    }
    try {
      const [health, info, ipcStatus] = await Promise.all([
        session.client.request("admin.health", {}, { branch }).then((r) => r.data),
        session.client.request("admin.info", {}, { branch }).then((r) => r.data),
        session.client.request("admin.ipc_status", {}, { branch }).then((r) => r.data),
      ]);
      return { ...base, health, info, ipcStatus, error: null };
    } catch (error) {
      return {
        ...base,
        health: null,
        info: null,
        ipcStatus: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async hubStatus(): Promise<HubStatus> {
    const hub = await this.effectiveHub();
    return {
      url: hub.url,
      source: hub.source,
      overridden: hub.overridden,
      warning: hub.warning ?? null,
      level: hub.warning ? "warn" : "ok",
      message: hub.warning ?? "Hub URL resolved.",
    };
  }

  private async effectiveHub(): Promise<EffectiveHub> {
    if (this.binary && vscode.workspace.isTrusted) {
      try {
        const { stdout, stderr } = await execFileAsync(this.binary, ["--json", "config", "show"], {
          encoding: "utf8",
          timeout: STATUS_TIMEOUT_MS,
        });
        const parsed = firstJsonObject(`${stdout}\n${stderr}`);
        const url = typeof parsed?.["hub.url"] === "string" ? parsed["hub.url"] : null;
        const source = typeof parsed?.source === "string" ? parsed.source : "strata config";
        if (url) return { url: normalizeHubUrl(url), source, overridden: false };
        const detail = typeof parsed?.detail === "string" ? parsed.detail : "no hub.url in config output";
        return fallbackHub(`Strata config did not resolve a hub URL: ${detail}`);
      } catch (error) {
        return fallbackHub(`Could not run strata --json config show: ${String(error)}`);
      }
    }

    return fallbackHub(
      this.binary
        ? "Workspace is untrusted, so StrataDB did not execute the Strata binary to resolve hub config."
        : "No Strata binary is configured, so StrataDB is using the built-in public hub for browsing.",
    );
  }

  private mcpStatus(databases: StatusDatabase[]): McpStatus {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    const consent = this.context.globalState.get<"always" | "never">(MCP_AGENT_CONSENT_KEY) ?? "unset";
    const dbPaths = databases
      .filter((database) => database.stateKind === "attachable" || database.stateKind === "unowned")
      .map((database) => database.dbPath);
    const expected = this.binary ? buildStrataEntries(dbPaths, this.binary) : {};
    const files = root ? mcpFiles(root, expected) : [];
    const nativeProvider = nativeMcpAvailable()
      ? vscode.workspace.isTrusted && this.binary && dbPaths.length > 0
        ? "available"
        : "blocked"
      : "unavailable";
    const blockingFile = files.find((file) => file.state === "malformed");
    const missing = files.some((file) => file.state === "missing" || file.state === "stale");
    const level = blockingFile ? "bad" : missing ? "warn" : dbPaths.length > 0 ? "ok" : "info";
    const message = blockingFile
      ? "One MCP config file is malformed and was left untouched."
      : missing
        ? "File-based agent registration is not current for this workspace."
        : dbPaths.length > 0
          ? "Agent registration is ready for this workspace."
          : "Connect or create a database before registering agents.";
    return { consent, nativeProvider, level, message, files };
  }
}

function workspaceStatus() {
  const root = vscode.workspace.workspaceFolders?.[0];
  return {
    name: root?.name ?? "No workspace folder",
    root: root?.uri.fsPath ?? null,
  };
}

function trustStatus(): TrustStatus {
  return vscode.workspace.isTrusted
    ? { trusted: true, level: "ok", message: "Workspace is trusted." }
    : {
        trusted: false,
        level: "warn",
        message: "Workspace is untrusted. StrataDB can connect to sockets but will not spawn the Strata binary.",
      };
}

function fallbackHub(warning: string): EffectiveHub {
  const env = process.env.STRATA_HUB_URL;
  if (env) {
    try {
      return { url: normalizeHubUrl(env), source: "STRATA_HUB_URL", warning, overridden: false };
    } catch (error) {
      return {
        url: DEFAULT_HUB_URL,
        source: "extension default",
        warning: `${warning} STRATA_HUB_URL is invalid: ${String(error)}`,
        overridden: false,
      };
    }
  }
  return { url: DEFAULT_HUB_URL, source: "extension default", warning, overridden: false };
}

function mcpFiles(root: string, expected: Record<string, { command: string; args: string[] }>): McpFileStatus[] {
  return [path.join(root, ".mcp.json"), path.join(root, ".cursor", "mcp.json")].map((file) => {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const inspection = inspectMcpConfig(existing, expected);
    return {
      label: path.basename(path.dirname(file)) === ".cursor" ? ".cursor/mcp.json" : ".mcp.json",
      file,
      exists: existing !== null,
      ...inspection,
    };
  });
}

function nativeMcpAvailable(): boolean {
  const lm = (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: unknown } }).lm;
  return typeof lm?.registerMcpServerDefinitionProvider === "function";
}

function suggestedFixes(
  binary: BinaryStatus,
  trust: TrustStatus,
  databases: StatusDatabase[],
  mcp: McpStatus,
): StatusFix[] {
  const fixes: StatusFix[] = [];
  if (!binary.found) {
    fixes.push({
      title: "Set Strata binary path",
      detail: "Install strata or point strata.binaryPath to the CLI binary.",
      level: "bad",
      action: { op: "open-settings" },
    });
  }
  if (!trust.trusted) {
    fixes.push({
      title: "Trust this workspace",
      detail: "Required for creating databases, starting hosts, cloning, and agent registration.",
      level: "warn",
      action: { op: "manage-trust" },
    });
  }
  if (databases.length === 0) {
    fixes.push({
      title: "Connect a database",
      detail: "Add an existing Strata database folder to the explorer.",
      level: "info",
      action: { op: "connect-database" },
    });
    fixes.push({
      title: "Browse StrataHub",
      detail: "Find a public dataset and clone it locally.",
      level: "info",
      action: { op: "browse-hub" },
    });
  } else if (databases.every((database) => !database.connected)) {
    fixes.push({
      title: "Open the Strata explorer",
      detail: "Review each database connection state and start a host where needed.",
      level: "warn",
      action: { op: "open-explorer" },
    });
  }
  const malformed = mcp.files.find((file) => file.state === "malformed");
  if (malformed) {
    fixes.push({
      title: `Fix ${malformed.label}`,
      detail: malformed.reason ?? "The MCP config cannot be parsed.",
      level: "bad",
      action: { op: "open-file", file: malformed.file },
    });
  } else if (mcp.files.some((file) => file.state === "missing" || file.state === "stale")) {
    fixes.push({
      title: "Register AI agents",
      detail: "Write Strata MCP entries to .mcp.json and .cursor/mcp.json.",
      level: "warn",
      action: { op: "register-agents" },
    });
  }
  return fixes;
}

function firstLine(text: string): string | null {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}
