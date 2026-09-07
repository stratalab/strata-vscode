import codiconCss from "@vscode/codicons/dist/codicon.css";
import { clear, h } from "../views/shared/dom";
import type { AgentHelperSnapshot, AgentViewOp, ExtToAgent } from "../agent/shared";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const CODICON_CLASSES = codiconCss.replace(/@font-face\s*\{[^}]*\}/, "");

class AgentRpc {
  private readonly vscode = acquireVsCodeApi();
  private nextReqId = 0;
  private readonly snapshotHandlers = new Set<(snapshot: AgentHelperSnapshot) => void>();
  private readonly pending = new Map<
    number,
    { resolve: (data: unknown) => void; reject: (error: string) => void }
  >();

  constructor() {
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as ExtToAgent;
      if (message.kind === "event") {
        if (message.event === "snapshot") {
          for (const handler of this.snapshotHandlers) handler(message.data);
        }
        return;
      }
      if (message.kind !== "response") return;
      const waiter = this.pending.get(message.reqId);
      if (!waiter) return;
      this.pending.delete(message.reqId);
      if (message.ok) waiter.resolve(message.data);
      else waiter.reject(message.error);
    });
  }

  request<T>(payload: AgentViewOp): Promise<T> {
    const reqId = ++this.nextReqId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve: resolve as (data: unknown) => void, reject });
      this.vscode.postMessage({ kind: "request", reqId, payload });
    });
  }

  onSnapshot(handler: (snapshot: AgentHelperSnapshot) => void): void {
    this.snapshotHandlers.add(handler);
  }
}

class AgentPanelApp {
  private snapshot: AgentHelperSnapshot | null = null;
  private loading = false;
  private busy: string | null = null;
  private toast: string | null = null;
  private error: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: AgentRpc,
  ) {
    this.rpc.onSnapshot((snapshot) => this.applySnapshot(snapshot));
  }

  async start(): Promise<void> {
    this.render();
    await this.load({ op: "bootstrap" });
  }

  private async load(op: AgentViewOp): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();
    try {
      this.applySnapshot(await this.rpc.request<AgentHelperSnapshot>(op));
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
      this.busy = null;
      this.render();
    }
  }

  private async action(op: AgentViewOp, label: string): Promise<void> {
    this.busy = label;
    this.error = null;
    this.render();
    try {
      const response = await this.rpc.request<AgentHelperSnapshot | null>(op);
      if (response) this.applySnapshot(response);
      const message = successMessage(op, label);
      if (message) this.flash(message);
    } catch (error) {
      this.error = String(error);
    } finally {
      this.busy = null;
      this.render();
    }
  }

  private applySnapshot(snapshot: AgentHelperSnapshot): void {
    this.snapshot = snapshot;
    this.render();
  }

  private render(): void {
    clear(this.root);
    document.body.classList.add("agent-body");
    this.root.className = "agent-shell";
    this.root.append(this.header());
    if (this.error) this.root.append(h("div", { class: "agent-error" }, icon("error"), this.error));
    if (!this.snapshot) {
      this.root.append(this.loadingState());
      return;
    }
    this.root.append(this.inferenceActions(), this.agentActions(), this.utilityRow());
    if (this.toast) this.root.append(h("div", { class: "agent-toast", role: "status" }, this.toast));
  }

  private header(): HTMLElement {
    return h(
      "header",
      { class: "agent-header" },
      h("div", { class: "agent-title" }, icon("hubot"), h("span", {}, "AI Agent")),
      h("button", { class: "icon-button", title: "Refresh", onclick: () => void this.load({ op: "refresh" }) }, icon("refresh")),
    );
  }

  private loadingState(): HTMLElement {
    return h("main", { class: "agent-loading" }, h("div", { class: "skeleton-line" }), h("div", { class: "skeleton-card" }));
  }

  private agentActions(): HTMLElement {
    const hasDatabase = this.snapshot?.primaryDatabase != null;
    return h(
      "section",
      { class: "agent-section" },
      h("div", { class: "section-title" }, "Agent"),
      this.commandButton({ op: "register-agents" }, "Register MCP", "plug"),
      this.commandButton({ op: "copy-mcp" }, "Copy MCP Setup", "copy", !hasDatabase),
      this.commandButton({ op: "copy-snippet", language: "typescript" }, "Copy TypeScript Starter", "symbol-method", !hasDatabase),
      this.commandButton({ op: "copy-snippet", language: "python" }, "Copy Python Starter", "symbol-method", !hasDatabase),
      this.commandButton({ op: "open-api-docs" }, "Open Strata API Docs", "book"),
    );
  }

  private inferenceActions(): HTMLElement {
    return h(
      "section",
      { class: "agent-section ai-section" },
      h("div", { class: "section-title" }, "AI"),
      h(
        "div",
        { class: "inference-grid" },
        this.commandButton({ op: "open-inference-docs", commandId: "inference.capability" }, "Capabilities", "sparkle"),
        this.commandButton({ op: "open-inference-docs", commandId: "inference.models.list" }, "Models", "list-tree"),
        this.commandButton({ op: "open-inference-docs", commandId: "inference.generate" }, "Generate", "wand"),
        this.commandButton({ op: "open-inference-docs", commandId: "inference.embed" }, "Embed", "symbol-array"),
        this.commandButton({ op: "open-inference-docs", commandId: "inference.rank" }, "Rank", "list-ordered"),
      ),
    );
  }

  private utilityRow(): HTMLElement {
    return h(
      "section",
      { class: "utility-row" },
      h("button", { class: "link-button", onclick: () => void this.action({ op: "connect-database" }, "Connect") }, icon("folder-opened"), "Connect"),
      h("button", { class: "link-button", onclick: () => void this.action({ op: "browse-hub" }, "Hub") }, icon("cloud-download"), "Hub"),
      h("button", { class: "link-button", onclick: () => void this.action({ op: "open-status" }, "Status") }, icon("dashboard"), "Status"),
    );
  }

  private commandButton(op: AgentViewOp, label: string, iconName: string, disabled = false): HTMLElement {
    const isBusy = this.busy === label;
    return h(
      "button",
      {
        class: "agent-button",
        title: label,
        ...(disabled || this.loading || this.busy !== null ? { disabled: "true" } : {}),
        onclick: () => void this.action(op, label),
      },
      icon(iconName),
      h("span", {}, isBusy ? "Working..." : label),
    );
  }

  private flash(message: string): void {
    this.toast = message;
    this.render();
    setTimeout(() => {
      if (this.toast === message) {
        this.toast = null;
        this.render();
      }
    }, 2_400);
  }
}

function successMessage(op: AgentViewOp, label: string): string | null {
  if (op.op === "copy-mcp" || op.op === "copy-snippet") return `${label} copied`;
  if (op.op === "register-agents") return "MCP registration updated";
  return null;
}

function icon(name: string): HTMLElement {
  return h("span", { class: `codicon codicon-${name}`, "aria-hidden": "true" });
}

const AGENT_STYLES = `
html,
body {
  height: 100%;
  padding: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.agent-body {
  margin: 0;
  color: var(--vscode-sideBar-foreground);
  background: var(--vscode-sideBar-background);
  font-family: var(--vscode-font-family), sans-serif;
  font-size: calc(var(--vscode-font-size, 13px) - 1px);
  line-height: 1.4;
}

.agent-shell {
  --line: var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border));
  --muted: var(--vscode-descriptionForeground);
  --panel: color-mix(in srgb, var(--vscode-sideBar-background) 72%, var(--vscode-editor-background));
  --hover: var(--vscode-list-hoverBackground);
  --accent: var(--vscode-charts-blue);
  min-height: 100vh;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 10px;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
}

.agent-title .codicon {
  color: var(--accent);
}

.codicon {
  font-size: inherit;
}

button {
  appearance: none;
  font: inherit;
  color: inherit;
}

.icon-button {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.icon-button:hover,
.agent-button:hover,
.link-button:hover {
  background: var(--hover);
}

.agent-section,
.agent-loading,
.agent-error {
  min-width: 0;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
}

.utility-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.section-title {
  color: var(--muted);
  font-weight: 600;
  text-transform: uppercase;
}

.agent-section > .agent-button:nth-child(2) {
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  border-color: var(--vscode-button-background);
}

.agent-section > .agent-button:nth-child(2):hover {
  background: var(--vscode-button-hoverBackground);
}

.agent-button {
  width: 100%;
  min-height: 30px;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-button span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inference-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.inference-grid .agent-button {
  min-height: 32px;
}

.inference-grid .agent-button:first-child {
  grid-column: 1 / -1;
}

.utility-row {
  min-width: 0;
}

.link-button {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.agent-loading {
  min-height: 150px;
  place-items: center;
  align-content: center;
}

.agent-error {
  color: var(--vscode-errorForeground);
}

.skeleton-line,
.skeleton-card {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  border-radius: 5px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--vscode-sideBar-foreground) 8%, transparent), transparent);
}

.skeleton-line {
  height: 22px;
}

.skeleton-card {
  height: 100px;
}

.agent-toast {
  position: sticky;
  bottom: 8px;
  z-index: 2;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--vscode-notifications-background);
  color: var(--vscode-notifications-foreground);
}
`;

const style = document.createElement("style");
style.textContent = `${CODICON_CLASSES}\n${AGENT_STYLES}`;
document.head.append(style);

const root = document.createElement("div");
document.body.append(root);
void new AgentPanelApp(root, new AgentRpc()).start();
