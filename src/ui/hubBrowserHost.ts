import * as vscode from "vscode";
import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_HUB_URL,
  HubApiClient,
  HubApiError,
  datasetListQuery,
  firstJsonObject,
  normalizeHubUrl,
  type DatasetCard,
  type DatasetListParams,
  type EffectiveHub,
  type HubInfo,
  type RefList,
} from "../hub/catalog";
import type {
  HubBootstrapData,
  HubCloneData,
  HubCloneProgressData,
  HubDetailData,
  HubErrorShape,
  HubListData,
  HubToExt,
  HubViewOp,
} from "../hub/shared";
import { runClone, type CloneError, type CloneProgressEvent } from "../hub/clone";
import { buildViewHtml } from "./viewHtml";
import { StrataBinaryMissingError } from "../attach/managedHost";

const execFileAsync = promisify(execFile);
const CONFIG_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60_000;

type CacheEntry = { value: unknown; expiresAt: number };

class CloneUiError extends Error {
  constructor(readonly clone: CloneError) {
    super(clone.message);
  }
}

export class HubBrowserHost {
  private panel: vscode.WebviewPanel | null = null;
  private hubOverride: string | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private cloneProgressSupported: boolean | null = null;
  private readonly knownClones = new Map<string, { dataset: string; branch: string }>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly binary: string | null,
    private readonly defaultParentPath: () => string,
    private readonly connectDatabase: (dbPath: string) => Promise<void>,
    private readonly openObjectBrowser: (dbPath: string, branch: string) => void,
    private readonly revealDatabase: (dbPath: string) => Promise<void>,
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "strataHubBrowser",
      "StrataHub",
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
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "hub", "main.js"),
    );
    const fontUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "views", "codicon.ttf"),
    );
    panel.webview.html = buildViewHtml(panel.webview.cspSource, scriptUri.toString(), fontUri.toString());

    panel.webview.onDidReceiveMessage((message: HubToExt) => {
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

  private async respond(panel: vscode.WebviewPanel, reqId: number, op: HubViewOp): Promise<void> {
    try {
      const data = await this.handle(op);
      void panel.webview.postMessage({ kind: "response", reqId, ok: true, data });
    } catch (error) {
      void panel.webview.postMessage({
        kind: "response",
        reqId,
        ok: false,
        error: shapeHubError(error),
      });
    }
  }

  private async handle(op: HubViewOp): Promise<unknown> {
    switch (op.op) {
      case "bootstrap":
        return this.bootstrap(op.force === true);
      case "list":
        return this.list(op.params, op.force === true);
      case "detail":
        return this.detail(op.name, op.force === true);
      case "clone":
        return this.clone(op.name, op.branch);
      case "open-clone":
        return this.openClone(op.dest, op.branch);
      case "reveal-clone":
        return this.revealClone(op.dest);
      case "copy-path":
        return this.copyPath(op.dest);
      case "change-hub":
        return this.changeHub();
      case "use-default-hub":
        this.hubOverride = null;
        return this.bootstrap(true);
      case "set-global-hub":
        return this.setGlobalHub();
    }
  }

  private async bootstrap(force: boolean): Promise<HubBootstrapData> {
    const hub = await this.effectiveHub();
    let info: HubInfo | null = null;
    try {
      const loaded = await this.cached<HubInfo>(
        `info:${hub.url}`,
        force,
        () => new HubApiClient(hub.url).info(),
      );
      info = loaded.value;
    } catch {
      // Bootstrap still needs to paint the shell; the list request will render
      // the actionable network error if the hub is unreachable.
    }
    return {
      hub,
      info,
      binaryAvailable: this.binary !== null,
      trusted: vscode.workspace.isTrusted,
      canClone: this.binary !== null && vscode.workspace.isTrusted,
    };
  }

  private async list(params: DatasetListParams, force: boolean): Promise<HubListData> {
    const hub = await this.effectiveHub();
    const key = `list:${hub.url}:${datasetListQuery(params)}`;
    const loaded = await this.cached(key, force, () => new HubApiClient(hub.url).listDatasets(params));
    return { page: loaded.value, hub, stale: loaded.stale };
  }

  private async detail(name: string, force: boolean): Promise<HubDetailData> {
    const hub = await this.effectiveHub();
    const client = new HubApiClient(hub.url);
    const card = await this.cached<DatasetCard>(
      `detail:${hub.url}:${name}`,
      force,
      () => client.getDataset(name),
    );
    let refs: { value: RefList | null; stale: boolean } = { value: null, stale: false };
    try {
      refs = await this.cached<RefList>(`refs:${hub.url}:${name}`, force, () => client.listRefs(name));
    } catch {
      // A detail card is still useful if branch listing fails.
    }
    return { card: card.value, refs: refs.value, hub, stale: card.stale || refs.stale };
  }

  private async clone(name: string, branch: string): Promise<HubCloneData> {
    if (!vscode.workspace.isTrusted) {
      throw new Error("Clone executes the Strata binary and is disabled in untrusted workspaces.");
    }
    if (!this.binary) throw new StrataBinaryMissingError();

    const dest = await vscode.window.showSaveDialog({
      title: `Clone ${name} from StrataHub`,
      saveLabel: "Clone",
      defaultUri: vscode.Uri.file(path.join(this.defaultParentPath(), safeFolderName(name))),
    });
    if (!dest) {
      return {
        cloned: false,
        dataset: name,
        branch,
        dest: null,
        manifestHash: null,
        objectCount: null,
        totalBytes: null,
        progressSupported: false,
        report: null,
      };
    }

    const hub = await this.effectiveHub();
    const progressSupported = await this.supportsCloneProgress();
    let lastPercent = 0;
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Cloning ${name} from StrataHub...` },
      (progress) => {
        if (!progressSupported) {
          progress.report({ message: "Waiting for the Strata clone command." });
        }
        return runClone(
          this.binary!,
          {
            dataset: name,
            branch: branch || undefined,
            dest: dest.fsPath,
            ...(hub.overridden ? { hubUrl: hub.url } : {}),
          },
          {
            progress: progressSupported,
            onProgress: (event) => {
              this.postCloneProgress(event);
              const percent = cloneProgressPercent(event);
              progress.report({
                message: cloneProgressMessage(event),
                ...(percent !== null ? { increment: Math.max(0, percent - lastPercent) } : {}),
              });
              if (percent !== null) lastPercent = Math.max(lastPercent, percent);
            },
          },
        );
      },
    );
    if (!result.ok) throw new CloneUiError(result.error);

    const summary = cloneResultSummary(result.report);
    const clonedBranch = summary.branch ?? branch;
    const clonedDest = summary.dest ?? dest.fsPath;
    const done: HubCloneProgressData = {
      stage: "done",
      dataset: name,
      branch: clonedBranch,
      manifestHash: summary.manifestHash,
      objectCount: summary.objectCount,
      totalBytes: summary.totalBytes,
      index: null,
      bytes: null,
    };
    this.postCloneProgress(done);
    await this.connectDatabase(clonedDest);
    this.knownClones.set(clonedDest, { dataset: name, branch: clonedBranch });
    void vscode.window.showInformationMessage(`StrataDB: cloned ${name} into ${clonedDest}`);
    return {
      cloned: true,
      dataset: name,
      branch: clonedBranch,
      dest: clonedDest,
      manifestHash: summary.manifestHash,
      objectCount: summary.objectCount,
      totalBytes: summary.totalBytes,
      progressSupported,
      report: result.report,
    };
  }

  private async openClone(dest: string, branch: string): Promise<{ opened: boolean }> {
    if (!this.knownClones.has(dest)) throw new Error("That cloned database is no longer tracked by this Hub browser session.");
    await vscode.commands.executeCommand("workbench.view.extension.strata");
    this.openObjectBrowser(dest, branch || this.knownClones.get(dest)?.branch || "default");
    return { opened: true };
  }

  private async revealClone(dest: string): Promise<{ revealed: boolean }> {
    if (!this.knownClones.has(dest)) throw new Error("That cloned database is no longer tracked by this Hub browser session.");
    await this.revealDatabase(dest);
    return { revealed: true };
  }

  private async copyPath(dest: string): Promise<{ copied: boolean }> {
    if (!this.knownClones.has(dest)) throw new Error("That cloned database is no longer tracked by this Hub browser session.");
    await vscode.env.clipboard.writeText(dest);
    void vscode.window.setStatusBarMessage("StrataDB: cloned database path copied", 2_000);
    return { copied: true };
  }

  private async changeHub(): Promise<HubBootstrapData> {
    const current = await this.effectiveHub();
    const value = await vscode.window.showInputBox({
      title: "Use StrataHub URL",
      prompt: "Applies to this StrataHub browser session. Leave global defaults unchanged.",
      value: current.url,
      placeHolder: DEFAULT_HUB_URL,
      validateInput: (input) => {
        try {
          normalizeHubUrl(input);
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    });
    if (value !== undefined) {
      this.hubOverride = normalizeHubUrl(value);
      this.cache.clear();
    }
    return this.bootstrap(true);
  }

  private async setGlobalHub(): Promise<HubBootstrapData> {
    if (!vscode.workspace.isTrusted) {
      throw new Error("Changing the global Strata hub runs the Strata binary and is disabled in untrusted workspaces.");
    }
    if (!this.binary) throw new StrataBinaryMissingError();

    const hub = await this.effectiveHub();
    const choice = await vscode.window.showWarningMessage(
      `Set ${hub.url} as your global Strata hub?`,
      { modal: true },
      "Set Global Hub",
    );
    if (choice === "Set Global Hub") {
      await execFileAsync(this.binary, ["--json", "config", "set", "hub.url", hub.url], {
        timeout: CONFIG_TIMEOUT_MS,
      });
      this.hubOverride = null;
      this.cache.clear();
      void vscode.window.showInformationMessage(`StrataDB: global hub set to ${hub.url}`);
    }
    return this.bootstrap(true);
  }

  private async supportsCloneProgress(): Promise<boolean> {
    if (this.cloneProgressSupported !== null) return this.cloneProgressSupported;
    if (!this.binary) return false;
    try {
      const { stdout, stderr } = await execFileAsync(this.binary, ["clone", "--help"], {
        timeout: CONFIG_TIMEOUT_MS,
      });
      this.cloneProgressSupported = `${stdout}\n${stderr}`.includes("--progress");
    } catch {
      this.cloneProgressSupported = false;
    }
    return this.cloneProgressSupported;
  }

  private postCloneProgress(event: CloneProgressEvent): void {
    void this.panel?.webview.postMessage({ kind: "event", event: "clone-progress", data: event });
  }

  private async effectiveHub(): Promise<EffectiveHub> {
    if (this.hubOverride) {
      return {
        url: this.hubOverride,
        source: "session override",
        overridden: true,
      };
    }

    if (this.binary && vscode.workspace.isTrusted) {
      try {
        const { stdout, stderr } = await execFileAsync(this.binary, ["--json", "config", "show"], {
          timeout: CONFIG_TIMEOUT_MS,
        });
        const parsed = firstJsonObject(`${stdout}\n${stderr}`);
        const url = typeof parsed?.["hub.url"] === "string" ? parsed["hub.url"] : null;
        const source = typeof parsed?.source === "string" ? parsed.source : "strata config";
        if (url) return { url: normalizeHubUrl(url), source, overridden: false };
        const detail = typeof parsed?.detail === "string" ? parsed.detail : "no hub.url in config output";
        return this.fallbackHub(`Strata config did not resolve a hub URL: ${detail}`);
      } catch (error) {
        return this.fallbackHub(`Could not run \`strata --json config show\`: ${String(error)}`);
      }
    }

    return this.fallbackHub(
      this.binary
        ? "Workspace is untrusted, so StrataDB did not execute the Strata binary to resolve hub config."
        : "No Strata binary is configured, so StrataDB is using the built-in public hub for browsing.",
    );
  }

  private fallbackHub(warning: string): EffectiveHub {
    const env = process.env.STRATA_HUB_URL;
    if (env) {
      try {
        return {
          url: normalizeHubUrl(env),
          source: "STRATA_HUB_URL",
          warning,
          overridden: false,
        };
      } catch (error) {
        return {
          url: DEFAULT_HUB_URL,
          source: "extension default",
          warning: `${warning} STRATA_HUB_URL is invalid: ${String(error)}`,
          overridden: false,
        };
      }
    }
    return {
      url: DEFAULT_HUB_URL,
      source: "extension default",
      warning,
      overridden: false,
    };
  }

  private async cached<T>(
    key: string,
    force: boolean,
    loader: () => Promise<T>,
  ): Promise<{ value: T; stale: boolean }> {
    const cached = this.cache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return { value: cached.value as T, stale: false };
    }
    try {
      const value = await loader();
      this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return { value, stale: false };
    } catch (error) {
      if (cached) return { value: cached.value as T, stale: true };
      throw error;
    }
  }
}

function safeFolderName(name: string): string {
  return name.split("/").pop()?.replace(/[^A-Za-z0-9_.-]/g, "-") || "strata-dataset";
}

function cloneProgressPercent(event: CloneProgressEvent): number | null {
  switch (event.stage) {
    case "resolved":
      return 10;
    case "manifest_fetched":
      return 20;
    case "object_fetched":
      if (!event.index || !event.objectCount) return 35;
      return Math.min(80, 20 + (event.index / Math.max(1, event.objectCount)) * 60);
    case "importing":
      return 88;
    case "done":
      return 100;
    case "unknown":
      return null;
  }
}

function cloneProgressMessage(event: CloneProgressEvent): string {
  switch (event.stage) {
    case "resolved":
      return `Resolved ${event.branch ?? "branch"}${event.manifestHash ? ` at ${shortHash(event.manifestHash)}` : ""}.`;
    case "manifest_fetched":
      return `Fetched manifest${event.objectCount !== null ? ` with ${event.objectCount} objects` : ""}.`;
    case "object_fetched":
      return event.index && event.objectCount
        ? `Fetched object ${event.index} of ${event.objectCount}.`
        : "Fetched object.";
    case "importing":
      return "Importing into the local database.";
    case "done":
      return "Clone complete.";
    case "unknown":
      return "Clone is making progress.";
  }
}

function cloneResultSummary(report: unknown): {
  branch: string | null;
  dest: string | null;
  manifestHash: string | null;
  objectCount: number | null;
  totalBytes: number | null;
} {
  const raw = report && typeof report === "object" ? (report as Record<string, unknown>) : {};
  const data = raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return {
    branch: stringField(data, "branch"),
    dest: stringField(data, "dest"),
    manifestHash: stringField(data, "manifest_hash"),
    objectCount: numberField(data, "object_count"),
    totalBytes: numberField(data, "total_bytes"),
  };
}

function shortHash(value: string): string {
  const withoutPrefix = value.replace(/^blake3:/, "");
  return `blake3:${withoutPrefix.slice(0, 10)}`;
}

function stringField(raw: Record<string, unknown>, key: string): string | null {
  return typeof raw[key] === "string" ? raw[key] : null;
}

function numberField(raw: Record<string, unknown>, key: string): number | null {
  return typeof raw[key] === "number" && Number.isFinite(raw[key]) ? raw[key] : null;
}

function shapeHubError(error: unknown): HubErrorShape {
  if (error instanceof CloneUiError) {
    return {
      message: error.clone.message,
      code: error.clone.code,
      status: null,
      retryable: error.clone.retryable,
    };
  }
  if (error instanceof HubApiError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      retryable: error.retryable,
    };
  }
  if (error instanceof StrataBinaryMissingError) {
    return {
      message: "No Strata binary is configured. Set strata.binaryPath or put strata on PATH.",
      code: "client.strata_binary_missing",
      status: null,
      retryable: false,
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    code: null,
    status: null,
    retryable: false,
  };
}
