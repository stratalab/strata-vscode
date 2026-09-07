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
import { runStrataCommandJson } from "../cli/run";
import { asWireBase64, encodeUtf8 } from "../wire/bytes";
import type {
  ViewFocus,
  ViewKind,
  ViewScope,
  ViewToExt,
  ViewWriteOp,
  WriteResultData,
} from "../views/shared/messages";

import { VIEW_DISPLAY } from "../explorer/primitiveDisplay";

export class ViewHost {
  private readonly panels = new Map<
    string,
    { panel: vscode.WebviewPanel; dbPath: string; branch: string; space: string }
  >();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
    private readonly binary: string | null,
  ) {
    // Ticks and scrub moves refresh every open view's scope (AR-5, F2.2).
    manager.onDidChange((dbPath) => this.broadcastScope(dbPath));
    viewContext.onDidChange((dbPath) => this.broadcastScope(dbPath));
  }

  scopeFor(dbPath: string, branch: string, space: string): ViewScope {
    return {
      dbPath,
      branch,
      space,
      asOfMicros: this.viewContext.asOfFor(dbPath),
      asOfLabel: this.viewContext.describeAsOf(dbPath),
    };
  }

  open(view: ViewKind, dbPath: string, branch: string, space: string, focus?: ViewFocus): void {
    const key = JSON.stringify([view, dbPath, branch, space]);
    const existing = this.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      if (focus) void existing.panel.webview.postMessage({ kind: "focus", focus });
      return;
    }
    const session = this.manager.session(dbPath);
    if (!session) {
      void vscode.window.showWarningMessage("StrataDB: that database is not connected.");
      return;
    }
    const service = new ViewDataService(session.client, async (label) => {
      const go = await vscode.window.showWarningMessage(
        `${label} is an expensive command: it holds the database's single execution lane while it runs.`,
        { modal: true },
        "Run",
      );
      return go === "Run";
    }, (scope, op) => this.writeObject(scope, op));

    // XC-3: short titles (space only when it isn't the default), per-view
    // tab icons matching the tree's icon language.
    const dbName = dbPath.split("/").pop();
    const title = `${VIEW_DISPLAY[view].panelTitle} · ${dbName}${branch === "default" ? "" : ` · ${branch}`}${space === "default" ? "" : ` · ${space}`}`;
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
    this.panels.set(key, { panel, dbPath, branch, space });
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
      const scope = this.scopeFor(dbPath, branch, space);
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

    void panel.webview.postMessage({ kind: "init", view, scope: this.scopeFor(dbPath, branch, space), focus });
  }

  private broadcastScope(dbPath?: string): void {
    for (const entry of this.panels.values()) {
      if (dbPath && entry.dbPath !== dbPath) continue;
      void entry.panel.webview.postMessage({
        kind: "refresh",
        scope: this.scopeFor(entry.dbPath, entry.branch, entry.space),
      });
    }
  }

  private async writeObject(scope: ViewScope, op: ViewWriteOp): Promise<WriteResultData> {
    if (scope.asOfMicros !== null) throw new Error("Back to now before writing.");
    if (!vscode.workspace.isTrusted) {
      throw new Error("Writes execute the strata binary and are disabled in untrusted workspaces.");
    }
    if (!this.binary) throw new Error("No strata binary configured. Set strata.binaryPath or put strata on PATH.");

    const command = commandForWrite(scope, op);
    const response = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Writing Strata object..." },
      () => runStrataCommandJson(this.binary!, scope.dbPath, command, 30_000),
    );
    const result = shapeWriteResult(response);
    this.manager.poke(scope.dbPath);
    void vscode.window.setStatusBarMessage(`StrataDB: ${result.message}`, 2_000);
    return result;
  }
}

function commandForWrite(scope: ViewScope, op: ViewWriteOp): Record<string, unknown> {
  if (op.op === "json-set") {
    return {
      type: "json_set",
      branch: scope.branch,
      space: scope.space,
      key: requiredName(op.docId, "Document id"),
      path: "$",
      value: parseJsonValue(op.valueText),
    };
  }
  const key =
    op.op === "kv-put-key"
      ? asWireBase64(op.keyB64)
      : encodeUtf8(requiredName(op.keyText, "Key"));
  return {
    type: "kv_put",
    branch: scope.branch,
    space: scope.space,
    key,
    value: encodeUtf8(op.valueText),
  };
}

function requiredName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function parseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON value must be valid JSON: ${detail}`);
  }
}

function shapeWriteResult(response: unknown): WriteResultData {
  const commit = commitFromResponse(response);
  return {
    message: commit ? `wrote version ${commit.version}` : "write completed",
    version: commit?.version ?? null,
    timestamp: commit?.timestamp ?? null,
    committedAt: commit?.committedAt ?? null,
    response,
  };
}

function commitFromResponse(response: unknown): { version: number; timestamp: number; committedAt: number | null } | null {
  if (!isRecord(response) || !isRecord(response.data) || !isRecord(response.data.commit)) return null;
  const version = response.data.commit.version;
  const timestamp = response.data.commit.timestamp;
  const committedAt = response.data.commit.committed_at;
  return typeof version === "number" && typeof timestamp === "number"
    ? { version, timestamp, committedAt: typeof committedAt === "number" ? committedAt : null }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
