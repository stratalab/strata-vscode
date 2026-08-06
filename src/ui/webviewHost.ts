/**
 * Webview host (E8): one panel per (database, view), strict CSP with a
 * per-panel nonce and zero network access (N8/N4), scope kept current on
 * ticks and scrub moves, and the F3.4 confirmation injected for analytics.
 */
import * as vscode from "vscode";
import { buildViewHtml } from "./viewHtml";
import type { DatabaseManager } from "../attach/manager";
import type { ViewContextStore } from "../state/viewContext";
import { ViewDataService, shapeViewError } from "./viewData";
import { ERROR_REGISTRY } from "../generated";
import type { ViewKind, ViewScope, ViewToExt } from "../views/shared/messages";

const VIEW_TITLES: Record<ViewKind, string> = {
  kv: "KV",
  json: "JSON",
  events: "Events",
  vectors: "Vectors",
  graph: "Graph",
};

export class ViewHost {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
  ) {
    // Ticks and scrub moves refresh every open view's scope (AR-5, F2.2).
    manager.onDidChange((dbPath) => this.broadcastScope(dbPath));
    viewContext.onDidChange((dbPath) => this.broadcastScope(dbPath));
  }

  scopeFor(dbPath: string, space: string): ViewScope {
    return {
      dbPath,
      branch: this.viewContext.branchFor(dbPath),
      space,
      asOfMicros: this.viewContext.asOfFor(dbPath),
      asOfLabel: this.viewContext.describeAsOf(dbPath),
    };
  }

  open(view: ViewKind, dbPath: string, space: string): void {
    const key = `${view}:${dbPath}:${space}`;
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return;
    }
    const session = this.manager.session(dbPath);
    if (!session) {
      void vscode.window.showWarningMessage("StrataDB: that database is not attached.");
      return;
    }
    const service = new ViewDataService(session.client, async (label) => {
      const go = await vscode.window.showWarningMessage(
        `${label} is an expensive command: it holds the database's single execution lane while it runs.`,
        { modal: true },
        "Run",
      );
      return go === "Run";
    });

    // XC-3: short titles (space only when it isn't the default), per-view
    // tab icons matching the tree's icon language.
    const dbName = dbPath.split("/").pop();
    const title = `${VIEW_TITLES[view]} · ${dbName}${space === "default" ? "" : ` · ${space}`}`;
    const panel = vscode.window.createWebviewPanel(
      "strataView",
      title,
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
      light: vscode.Uri.joinPath(this.context.extensionUri, "media", "icons", `${view}-light.svg`),
      dark: vscode.Uri.joinPath(this.context.extensionUri, "media", "icons", `${view}-dark.svg`),
    };
    this.panels.set(key, panel);
    panel.onDidDispose(() => this.panels.delete(key));

    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "views", "main.js"),
    );
    const fontUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "views", "codicon.ttf"),
    );
    panel.webview.html = buildViewHtml(panel.webview.cspSource, scriptUri.toString(), fontUri.toString());

    panel.webview.onDidReceiveMessage(async (message: ViewToExt) => {
      if (message.kind !== "request") return;
      const scope = this.scopeFor(dbPath, space);
      if (message.payload.op === "open-docs") {
        // The webview never carries URLs (N8); the host owns the mapping.
        const code = message.payload.code;
        const registered = ERROR_REGISTRY[code as keyof typeof ERROR_REGISTRY];
        void vscode.env.openExternal(
          vscode.Uri.parse(registered?.docsUrl ?? `https://stratadb.org/e/${code}`),
        );
        void panel.webview.postMessage({ kind: "response", reqId: message.reqId, ok: true, data: null });
        return;
      }
      if (message.payload.op === "scrub") {
        // Timeline clicks drive the scrubber (F2.3) — a host-level concern.
        this.viewContext.setAsOf(dbPath, message.payload.micros);
        if (message.payload.micros === null) this.manager.poke(dbPath);
        void panel.webview.postMessage({ kind: "response", reqId: message.reqId, ok: true, data: null });
        return;
      }
      try {
        const data = await service.handle(scope, message.payload);
        void panel.webview.postMessage({ kind: "response", reqId: message.reqId, ok: true, data });
      } catch (error) {
        void panel.webview.postMessage({
          kind: "response",
          reqId: message.reqId,
          ok: false,
          error: shapeViewError(error),
        });
      }
    });

    void panel.webview.postMessage({ kind: "init", view, scope: this.scopeFor(dbPath, space) });
  }

  private broadcastScope(dbPath?: string): void {
    for (const [key, panel] of this.panels) {
      const [, panelDb, space] = key.split(":");
      if (dbPath && panelDb !== dbPath) continue;
      void panel.webview.postMessage({ kind: "refresh", scope: this.scopeFor(panelDb!, space!) });
    }
  }
}
