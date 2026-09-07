import codiconCss from "@vscode/codicons/dist/codicon.css";
import { clear, h } from "../views/shared/dom";
import { formatCount } from "../views/shared/format";
import type {
  ExtToStatus,
  McpFileStatus,
  StatusAction,
  StatusCenterData,
  StatusCenterOp,
  StatusDatabase,
  StatusFact,
  StatusFix,
  StatusLevel,
} from "../status/shared";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const CODICON_CLASSES = codiconCss.replace(/@font-face\s*\{[^}]*\}/, "");

class StatusRpc {
  private readonly vscode = acquireVsCodeApi();
  private nextReqId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (data: unknown) => void; reject: (error: string) => void }
  >();

  constructor() {
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as ExtToStatus;
      if (message.kind !== "response") return;
      const waiter = this.pending.get(message.reqId);
      if (!waiter) return;
      this.pending.delete(message.reqId);
      if (message.ok) waiter.resolve(message.data);
      else waiter.reject(message.error);
    });
  }

  request<T>(payload: StatusCenterOp): Promise<T> {
    const reqId = ++this.nextReqId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve: resolve as (data: unknown) => void, reject });
      this.vscode.postMessage({ kind: "request", reqId, payload });
    });
  }
}

class StatusCenterApp {
  private data: StatusCenterData | null = null;
  private loading = false;
  private busyAction: string | null = null;
  private error: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: StatusRpc,
  ) {}

  async start(): Promise<void> {
    this.render();
    await this.load({ op: "bootstrap" });
  }

  private async load(op: StatusCenterOp): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();
    try {
      this.data = await this.rpc.request<StatusCenterData>(op);
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
      this.busyAction = null;
      this.render();
    }
  }

  private async runAction(action: StatusAction, label: string): Promise<void> {
    this.busyAction = label;
    this.error = null;
    this.render();
    try {
      this.data = await this.rpc.request<StatusCenterData>(action);
    } catch (error) {
      this.error = String(error);
    } finally {
      this.busyAction = null;
      this.render();
    }
  }

  private render(): void {
    clear(this.root);
    document.body.classList.add("status-body");
    this.root.className = "status-shell";
    if (!this.data) {
      this.root.append(this.header(), this.loadingState());
      return;
    }
    const content = [
      this.header(),
      this.summaryStrip(this.data),
    ];
    if (this.error) content.push(h("div", { class: "status-error" }, icon("error"), this.error));
    content.push(
      h(
        "main",
        { class: "status-grid" },
        h("section", { class: "panel fixes-panel" }, this.sectionHead("Suggested Fixes", "sparkle"), this.fixes(this.data.fixes)),
        h("section", { class: "panel" }, this.sectionHead("Environment", "tools"), this.environmentFacts(this.data)),
        h("section", { class: "panel wide" }, this.sectionHead("Connected Databases", "database"), this.databases(this.data.databases)),
        h("section", { class: "panel" }, this.sectionHead("AI Agents", "hubot"), this.mcp(this.data.mcp.files)),
        h("section", { class: "panel" }, this.sectionHead("StrataHub", "cloud-download"), this.hub(this.data)),
      ),
    );
    this.root.append(...content);
  }

  private header(): HTMLElement {
    return h(
      "header",
      { class: "status-header" },
      h(
        "div",
        { class: "status-title" },
        h("span", { class: "codicon codicon-heart-pulse", "aria-hidden": "true" }),
        h("div", {}, h("h1", {}, "Strata Status"), h("p", {}, this.data ? `Updated ${formatTime(this.data.generatedAt)}` : "Collecting setup facts")),
      ),
      h(
        "div",
        { class: "status-actions" },
        this.actionButton({ op: "refresh" }, "Refresh", "refresh"),
        this.actionButton({ op: "connect-database" }, "Connect", "folder-opened"),
        this.actionButton({ op: "create-database" }, "New Database", "add"),
        this.actionButton({ op: "register-agents" }, "Register Agents", "hubot"),
      ),
    );
  }

  private loadingState(): HTMLElement {
    return h(
      "main",
      { class: "status-loading" },
      h("div", { class: "skeleton-title" }),
      h("div", { class: "skeleton-grid" }, ...Array.from({ length: 8 }, () => h("div", { class: "skeleton-card" }))),
    );
  }

  private summaryStrip(data: StatusCenterData): HTMLElement {
    const connected = data.databases.filter((database) => database.connected).length;
    return h(
      "section",
      { class: "summary-strip" },
      this.summaryCard("Binary", data.binary.version ?? data.binary.message, data.binary.level, "terminal"),
      this.summaryCard("Workspace", data.trust.trusted ? "Trusted" : "Untrusted", data.trust.level, "workspace-trusted"),
      this.summaryCard("Databases", `${formatCount(connected)} connected`, connected > 0 ? "ok" : data.databases.length ? "warn" : "info", "database"),
      this.summaryCard("Agents", data.mcp.message, data.mcp.level, "hubot"),
      this.summaryCard("Hub", compactUrl(data.hub.url), data.hub.level, "cloud"),
    );
  }

  private summaryCard(label: string, value: string, level: StatusLevel, iconName: string): HTMLElement {
    return h(
      "div",
      { class: `summary-card ${level}` },
      h("span", { class: "summary-icon" }, icon(iconName)),
      h("span", { class: "summary-label" }, label),
      h("strong", { title: value }, value),
    );
  }

  private sectionHead(title: string, iconName: string): HTMLElement {
    return h("div", { class: "section-head" }, icon(iconName), h("h2", {}, title));
  }

  private environmentFacts(data: StatusCenterData): HTMLElement {
    const facts: StatusFact[] = [
      { label: "Binary", value: data.binary.path ?? "Not found", level: data.binary.level },
      { label: "Version", value: data.binary.version ?? "Unknown", level: data.binary.level },
      { label: "Workspace", value: data.workspace.root ?? data.workspace.name },
      { label: "Trust", value: data.trust.message, level: data.trust.level },
      { label: "MCP consent", value: data.mcp.consent },
      { label: "Native MCP", value: data.mcp.nativeProvider, level: data.mcp.nativeProvider === "available" ? "ok" : "warn" },
    ];
    return h("div", { class: "fact-list" }, ...facts.map((fact) => this.fact(fact)));
  }

  private fact(fact: StatusFact): HTMLElement {
    return h(
      "div",
      { class: "fact-row" },
      h("span", {}, fact.label),
      h("strong", { class: fact.level ? `level-${fact.level}` : "", title: fact.value }, fact.value),
    );
  }

  private fixes(fixes: StatusFix[]): HTMLElement {
    if (fixes.length === 0) {
      return h("div", { class: "ready-state" }, icon("pass"), h("strong", {}, "Setup looks ready"), h("p", {}, "No immediate fixes are needed."));
    }
    return h(
      "div",
      { class: "fix-list" },
      ...fixes.map((fix) =>
        h(
          "button",
          {
            class: `fix-row ${fix.level}`,
            onclick: () => void this.runAction(fix.action, fix.title),
          },
          icon(levelIcon(fix.level)),
          h("span", {}, h("strong", {}, this.busyAction === fix.title ? "Working..." : fix.title), h("em", {}, fix.detail)),
          icon("chevron-right"),
        ),
      ),
    );
  }

  private databases(databases: StatusDatabase[]): HTMLElement {
    if (databases.length === 0) {
      return h("div", { class: "empty-state" }, icon("database"), h("strong", {}, "No databases"), h("p", {}, "Connect an existing database or clone one from StrataHub."));
    }
    return h(
      "div",
      { class: "database-list" },
      ...databases.map((database) => this.databaseRow(database)),
    );
  }

  private databaseRow(database: StatusDatabase): HTMLElement {
    const healthLevel = database.health?.status === "healthy" ? "ok" : database.health ? "warn" : database.connected ? "warn" : "info";
    const clients = database.ipcStatus ? `${formatCount(database.ipcStatus.client_count)} clients` : "No IPC facts";
    return h(
      "article",
      { class: "database-row" },
      h(
        "div",
        { class: "database-main" },
        h("div", {}, h("strong", {}, database.name), h("p", { title: database.dbPath }, database.dbPath)),
        h("span", { class: `state-chip ${database.connected ? "ok" : "info"}` }, database.connected ? "connected" : database.stateKind),
      ),
      h(
        "div",
        { class: "database-facts" },
        metric("Branch", database.branch),
        metric("Health", database.health?.status ?? database.stateDescription, healthLevel),
        metric("Spaces", database.info ? formatCount(database.info.space_count) : "unknown"),
        metric("IPC", clients),
        database.scrubbedTo ? metric("Time", `as of ${database.scrubbedTo}`, "warn") : null,
        database.managed ? metric("Host", "managed") : null,
      ),
      database.error ? h("p", { class: "row-error" }, database.error) : null,
    );
  }

  private mcp(files: McpFileStatus[]): HTMLElement {
    return h(
      "div",
      { class: "mcp-block" },
      files.length
        ? h("div", { class: "mcp-files" }, ...files.map((file) => this.mcpFile(file)))
        : h("p", { class: "muted" }, "Open a workspace folder to inspect file-based agent registration."),
      h(
        "div",
        { class: "inline-actions" },
        this.actionButton({ op: "register-agents" }, "Register", "hubot"),
        this.actionButton({ op: "remove-agent-registrations" }, "Remove", "trash"),
      ),
    );
  }

  private mcpFile(file: McpFileStatus): HTMLElement {
    return h(
      "button",
      {
        class: `mcp-file ${file.state}`,
        onclick: () => file.exists ? void this.runAction({ op: "open-file", file: file.file }, `Open ${file.label}`) : undefined,
      },
      h("span", { class: "file-name" }, file.label),
      h("span", { class: `state-chip ${mcpLevel(file.state)}` }, file.state),
      h("small", { title: file.file }, file.reason ?? entrySummary(file)),
    );
  }

  private hub(data: StatusCenterData): HTMLElement {
    return h(
      "div",
      { class: "hub-block" },
      this.fact({ label: "URL", value: data.hub.url, level: data.hub.level }),
      this.fact({ label: "Source", value: data.hub.source }),
      data.hub.warning ? h("p", { class: "hub-warning" }, data.hub.warning) : null,
      h("div", { class: "inline-actions" }, this.actionButton({ op: "browse-hub" }, "Browse Hub", "cloud-download")),
    );
  }

  private actionButton(action: StatusCenterOp, label: string, iconName: string): HTMLElement {
    return h(
      "button",
      {
        class: "toolbar-button",
        ...(this.loading || this.busyAction !== null ? { disabled: "true" } : {}),
        onclick: () => void this.loadOrAction(action, label),
      },
      icon(iconName),
      label,
    );
  }

  private loadOrAction(action: StatusCenterOp, label: string): Promise<void> {
    return action.op === "bootstrap" || action.op === "refresh"
      ? this.load(action)
      : this.runAction(action as StatusAction, label);
  }
}

function icon(name: string): HTMLElement {
  return h("span", { class: `codicon codicon-${name}`, "aria-hidden": "true" });
}

function metric(label: string, value: string, level?: StatusLevel): HTMLElement {
  return h("span", { class: `metric${level ? ` level-${level}` : ""}` }, h("em", {}, label), h("strong", { title: value }, value));
}

function levelIcon(level: StatusLevel): string {
  switch (level) {
    case "ok":
      return "pass";
    case "warn":
      return "warning";
    case "bad":
      return "error";
    case "info":
      return "info";
  }
}

function mcpLevel(state: McpFileStatus["state"]): StatusLevel {
  switch (state) {
    case "registered":
      return "ok";
    case "malformed":
      return "bad";
    case "missing":
    case "stale":
      return "warn";
    case "idle":
      return "info";
  }
}

function entrySummary(file: McpFileStatus): string {
  if (file.managedEntries.length > 0) return `${file.managedEntries.join(", ")} configured`;
  if (file.missingEntries.length > 0) return `${file.missingEntries.join(", ")} missing`;
  return file.exists ? "No Strata entries" : "File does not exist";
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? url.host : `${url.host}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value;
  }
}

const STATUS_STYLES = `
html,
body {
  min-height: 100%;
  padding: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.status-body {
  margin: 0;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  font-family: "Inter", "Aptos", "SF Pro Text", "Segoe UI Variable", var(--vscode-font-family), sans-serif;
  font-size: var(--vscode-font-size);
}

.status-shell {
  --line: var(--vscode-widget-border);
  --muted: var(--vscode-descriptionForeground);
  --panel: color-mix(in srgb, var(--vscode-editorWidget-background) 72%, var(--vscode-editor-background));
  --panel-2: color-mix(in srgb, var(--vscode-sideBar-background) 76%, var(--vscode-editor-background));
  --hover: var(--vscode-list-hoverBackground);
  --accent: var(--vscode-charts-blue);
  --ok: var(--vscode-charts-green);
  --warn: var(--vscode-charts-yellow);
  --bad: var(--vscode-errorForeground);
  min-height: 100vh;
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--vscode-sideBar-background) 54%, var(--vscode-editor-background));
}

.status-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.status-title > .codicon {
  color: var(--accent);
  font-size: 23px;
}

.status-title h1,
.status-title p,
.section-head h2,
.database-main p,
.ready-state p,
.empty-state p,
.hub-warning,
.row-error {
  margin: 0;
}

.status-title h1 {
  font-size: 20px;
  font-weight: 680;
  letter-spacing: 0;
}

.status-title p,
.muted,
.database-main p,
.ready-state p,
.empty-state p,
.mcp-file small,
.fact-row span,
.metric em {
  color: var(--muted);
}

.status-actions,
.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

button {
  font: inherit;
  color: inherit;
  appearance: none;
}

.toolbar-button {
  min-height: 29px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--vscode-button-border, var(--line));
  border-radius: 4px;
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  cursor: pointer;
}

.toolbar-button:hover {
  background: var(--vscode-button-hoverBackground);
}

.toolbar-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--panel-2);
}

.summary-card {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
}

.summary-icon {
  grid-row: span 2;
}

.summary-card.ok .summary-icon { color: var(--ok); }
.summary-card.warn .summary-icon { color: var(--warn); }
.summary-card.bad .summary-icon { color: var(--bad); }
.summary-card.info .summary-icon { color: var(--accent); }

.summary-label,
.fact-row span,
.metric em {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
}

.summary-card strong,
.fact-row strong,
.database-main strong,
.metric strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.85fr) minmax(340px, 1fr);
  gap: 14px;
  padding: 16px 20px 28px;
}

.panel {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
}

.panel.wide {
  grid-row: span 2;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-head .codicon {
  color: var(--accent);
}

.section-head h2 {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}

.fact-list,
.fix-list,
.database-list,
.mcp-block,
.mcp-files,
.hub-block {
  display: grid;
  gap: 8px;
}

.fact-row {
  display: grid;
  grid-template-columns: minmax(92px, 0.35fr) minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  padding: 7px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 52%, transparent);
}

.fix-row,
.mcp-file {
  width: 100%;
  min-height: 48px;
  display: grid;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.fix-row {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.fix-row:hover,
.mcp-file:hover {
  background: var(--hover);
}

.fix-row span,
.fix-row strong,
.fix-row em,
.mcp-file small {
  min-width: 0;
  display: block;
}

.fix-row em {
  margin-top: 3px;
  color: var(--muted);
  font-style: normal;
}

.fix-row.ok > .codicon { color: var(--ok); }
.fix-row.warn > .codicon { color: var(--warn); }
.fix-row.bad > .codicon { color: var(--bad); }
.fix-row.info > .codicon { color: var(--accent); }

.ready-state,
.empty-state,
.status-loading {
  min-height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: var(--muted);
  text-align: center;
}

.ready-state > .codicon {
  color: var(--ok);
  font-size: 28px;
}

.empty-state > .codicon {
  color: var(--accent);
  font-size: 28px;
}

.database-row {
  min-width: 0;
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--vscode-editor-background) 34%, transparent);
}

.database-main {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.database-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(96px, 1fr));
  gap: 7px;
}

.metric {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
  border-radius: 4px;
}

.state-chip {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.level-ok,
.state-chip.ok {
  color: var(--ok);
}

.level-warn,
.state-chip.warn {
  color: var(--warn);
}

.level-bad,
.state-chip.bad {
  color: var(--bad);
}

.level-info,
.state-chip.info {
  color: var(--accent);
}

.mcp-file {
  grid-template-columns: minmax(0, 1fr) auto;
}

.mcp-file small {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--vscode-editor-font-family), monospace;
}

.hub-warning,
.row-error,
.status-error {
  padding: 9px 10px;
  border: 1px solid var(--vscode-inputValidation-warningBorder, var(--line));
  border-radius: 5px;
  color: var(--vscode-inputValidation-warningForeground);
  background: var(--vscode-inputValidation-warningBackground);
}

.row-error,
.status-error {
  color: var(--vscode-errorForeground);
  background: transparent;
}

.status-error {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 14px 20px 0;
}

.skeleton-title,
.skeleton-card {
  border: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
  border-radius: 6px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--vscode-editor-foreground) 8%, transparent), transparent);
}

.skeleton-title {
  width: min(420px, 72vw);
  height: 34px;
}

.skeleton-grid {
  width: min(980px, calc(100vw - 40px));
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 10px;
}

.skeleton-card {
  height: 96px;
}

@media (max-width: 980px) {
  .status-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .summary-strip,
  .status-grid {
    grid-template-columns: 1fr;
  }

  .panel.wide {
    grid-row: auto;
  }
}

@media (max-width: 620px) {
  .status-header,
  .summary-strip,
  .status-grid {
    padding-left: 12px;
    padding-right: 12px;
  }

  .database-facts,
  .fact-row,
  .skeleton-grid {
    grid-template-columns: 1fr;
  }
}
`;

const style = document.createElement("style");
style.textContent = `${CODICON_CLASSES}\n${STATUS_STYLES}`;
document.head.append(style);

const root = document.createElement("div");
document.body.append(root);
void new StatusCenterApp(root, new StatusRpc()).start();
