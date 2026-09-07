import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DatabaseEntry, DatabaseManager } from "../attach/manager";
import { describeState } from "../attach/attachment";
import type { ViewContextStore } from "../state/viewContext";
import { buildViewHtml } from "./viewHtml";
import {
  inferenceDocsUrl,
  mcpSetupForDatabases,
  strataApiDocsUrl,
  starterSnippet,
  type AgentScope,
} from "../agent/helpers";
import type {
  AgentDatabaseTarget,
  AgentHelperSnapshot,
  AgentToExt,
  AgentViewOp,
} from "../agent/shared";
import { buildStrataEntries } from "../mcp/registration";
import { inspectMcpConfig } from "../mcp/status";

export interface AgentHelperActions {
  registerAgents(): unknown;
  connectDatabase(): unknown;
  browseHub(): unknown;
  openStatus(): unknown;
}

export class AgentHelperViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly binary: string | null,
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
    private readonly actions: AgentHelperActions,
  ) {
    manager.onDidChange(() => void this.postSnapshot());
    viewContext.onDidChange(() => void this.postSnapshot());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    const scriptUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "agent", "main.js"),
    );
    const fontUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "views", "codicon.ttf"),
    );
    webviewView.webview.html = buildViewHtml(webviewView.webview.cspSource, scriptUri.toString(), fontUri.toString());
    webviewView.webview.onDidReceiveMessage((message: AgentToExt) => {
      if (message.kind === "ready") {
        void this.respond(0, { op: "bootstrap" });
        return;
      }
      if (message.kind === "request") void this.respond(message.reqId, message.payload);
    });
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = null;
    });
  }

  private async respond(reqId: number, op: AgentViewOp): Promise<void> {
    try {
      const data = await this.handle(op);
      void this.view?.webview.postMessage({ kind: "response", reqId, ok: true, data });
    } catch (error) {
      void this.view?.webview.postMessage({
        kind: "response",
        reqId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handle(op: AgentViewOp): Promise<AgentHelperSnapshot | null> {
    switch (op.op) {
      case "bootstrap":
        return this.snapshot();
      case "refresh":
        await this.manager.refresh();
        return this.snapshot();
      case "register-agents":
        await this.actions.registerAgents();
        return this.snapshot();
      case "connect-database":
        await this.actions.connectDatabase();
        return this.snapshot();
      case "browse-hub":
        await this.actions.browseHub();
        return this.snapshot();
      case "open-status":
        await this.actions.openStatus();
        return this.snapshot();
      case "copy-mcp":
        await this.copyMcp();
        return this.snapshot();
      case "copy-snippet":
        await vscode.env.clipboard.writeText(starterSnippet(op.language, this.primaryScope(), this.binary));
        void vscode.window.setStatusBarMessage(`StrataDB: ${op.language} starter copied`, 2_000);
        return this.snapshot();
      case "open-api-docs":
        void vscode.env.openExternal(vscode.Uri.parse(strataApiDocsUrl()));
        return null;
      case "open-inference-docs":
        void vscode.env.openExternal(vscode.Uri.parse(inferenceDocsUrl(op.commandId)));
        return null;
    }
  }

  private async postSnapshot(): Promise<void> {
    if (!this.view) return;
    void this.view.webview.postMessage({
      kind: "event",
      event: "snapshot",
      data: await this.snapshot(),
    });
  }

  private async snapshot(): Promise<AgentHelperSnapshot> {
    const databases = this.manager.list().map((entry) => this.databaseTarget(entry));
    return {
      trusted: vscode.workspace.isTrusted,
      binaryPath: this.binary,
      mcp: this.mcpStatus(databases),
      databases,
      primaryDatabase: primaryDatabase(databases),
    };
  }

  private databaseTarget(entry: DatabaseEntry): AgentDatabaseTarget {
    return {
      dbPath: entry.dbPath,
      name: path.basename(entry.dbPath),
      stateKind: entry.disconnected ? "disconnected" : entry.state.kind,
      stateDescription: entry.disconnected ? "disconnected" : describeState(entry.state),
      connected: this.manager.session(entry.dbPath) !== undefined,
      managed: entry.managed,
    };
  }

  private async copyMcp(): Promise<void> {
    const dbPaths = this.registerableDbPaths();
    if (dbPaths.length === 0) throw new Error("Connect or create a Strata database before copying MCP setup.");
    await vscode.env.clipboard.writeText(mcpSetupForDatabases(dbPaths, this.binary));
    void vscode.window.setStatusBarMessage("StrataDB: MCP setup copied", 2_000);
  }

  private primaryScope(): AgentScope {
    const database = primaryDatabase(this.manager.list().map((entry) => this.databaseTarget(entry)));
    if (!database) throw new Error("Connect or create a Strata database before copying a starter snippet.");
    return {
      dbPath: database.dbPath,
      branch: this.viewContext.branchFor(database.dbPath),
      space: "default",
    };
  }

  private registerableDbPaths(): string[] {
    return this.manager
      .list()
      .filter((entry) => entry.state.kind === "attachable" || entry.state.kind === "unowned")
      .map((entry) => entry.dbPath);
  }

  private mcpStatus(databases: AgentDatabaseTarget[]) {
    if (!this.binary) return { level: "bad" as const, message: "Set strata.binaryPath" };
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return { level: "info" as const, message: "Open a workspace" };
    const dbPaths = databases.filter(isRegisterableDatabase).map((database) => database.dbPath);
    if (dbPaths.length === 0) return { level: "info" as const, message: "Connect a database" };
    const expected = buildStrataEntries(dbPaths, this.binary);
    const files = [path.join(root, ".mcp.json"), path.join(root, ".cursor", "mcp.json")].map((file) =>
      inspectMcpConfig(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null, expected),
    );
    if (files.some((file) => file.state === "malformed")) return { level: "bad" as const, message: "Fix MCP config JSON" };
    if (files.some((file) => file.state === "missing" || file.state === "stale")) {
      return { level: "warn" as const, message: "Register agents" };
    }
    return { level: "ok" as const, message: "Agents ready" };
  }
}

function isRegisterableDatabase(database: AgentDatabaseTarget): boolean {
  return database.stateKind === "attachable" || database.stateKind === "unowned";
}

function primaryDatabase(databases: AgentDatabaseTarget[]): AgentDatabaseTarget | null {
  return (
    databases.find((database) => database.connected) ??
    databases.find(isRegisterableDatabase) ??
    databases[0] ??
    null
  );
}
