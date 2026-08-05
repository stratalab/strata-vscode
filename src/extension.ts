import * as vscode from "vscode";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { IDL_STAMPS, STRATA_CORE_REV } from "./generated";
import { DatabaseManager } from "./attach/manager";
import { ManagedHostManager, WorkspaceNotTrustedError, StrataBinaryMissingError, type ManagedHostRecord } from "./attach/managedHost";
import { StrataTreeProvider } from "./ui/explorerView";
import { InspectorDocuments, INSPECT_SCHEME } from "./ui/inspectorDoc";
import { renderStatus, type DatabaseStatus } from "./ui/statusModel";
import { inspectEvent, inspectJson, inspectKv } from "./explorer/inspector";
import { copyAsCli, copyAsWireJson } from "./explorer/copyAs";
import { keyText } from "./explorer/decode";
import type { ExplorerNode } from "./explorer/model";
import type { ClientIdentity } from "./wire/protocol";

const MANAGED_HOSTS_KEY = "strata.managedHosts";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("StrataDB");
  context.subscriptions.push(output);
  output.appendLine(
    `StrataDB activated — IDL ${IDL_STAMPS.schemaVersion}, strata-core ${STRATA_CORE_REV.slice(0, 12)}`,
  );

  const identity: ClientIdentity = {
    name: "strata-vscode",
    version: (context.extension.packageJSON as { version?: string }).version ?? "0.0.0",
    pid: process.pid,
  };

  const binary = resolveBinaryFromSettings();
  const hosts = new ManagedHostManager(
    binary,
    {
      loadHosts: () => context.workspaceState.get<ManagedHostRecord[]>(MANAGED_HOSTS_KEY, []),
      saveHosts: (records) => void context.workspaceState.update(MANAGED_HOSTS_KEY, records),
    },
    vscode.workspace.isTrusted,
  );
  const adopted = hosts.adoptOrForget(); // AR-8.1: re-adopt orphans, forget the dead
  if (adopted.length > 0) {
    output.appendLine(`re-adopted ${adopted.length} managed host(s): ${adopted.map((r) => r.dbPath).join(", ")}`);
  }

  const manager = new DatabaseManager(
    {
      workspaceRoots: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      explicitDatabases: vscode.workspace.getConfiguration("strata").get<string[]>("databases", []),
      identity,
    },
    hosts,
  );
  context.subscriptions.push({ dispose: () => void manager.dispose() });

  const tree = new StrataTreeProvider(manager);
  const treeView = vscode.window.createTreeView("strataExplorer", { treeDataProvider: tree });
  context.subscriptions.push(treeView);
  // AR-5.4: visibility gates tick delivery, never the subscriptions.
  context.subscriptions.push(
    treeView.onDidChangeVisibility((e) => manager.setVisible(e.visible)),
  );

  const inspectors = new InspectorDocuments();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(INSPECT_SCHEME, inspectors),
  );

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusItem.command = "strata.refreshDatabases";
  context.subscriptions.push(statusItem);

  async function updateStatusBar(): Promise<void> {
    const databases: DatabaseStatus[] = [];
    for (const entry of manager.list()) {
      const session = manager.session(entry.dbPath);
      let ipcStatus;
      if (session) {
        try {
          const response = await session.client.request("admin.ipc_status", {}, { branch: "default" });
          ipcStatus = response.data;
        } catch {
          // Owner mid-death: the state machine will re-render shortly.
        }
      }
      databases.push({
        dbPath: entry.dbPath,
        stateDescription: entry.state.kind,
        ...(ipcStatus !== undefined ? { ipcStatus } : {}),
      });
    }
    const rendered = renderStatus(databases, identity);
    statusItem.text = rendered.text;
    statusItem.tooltip = new vscode.MarkdownString(rendered.tooltipMarkdown);
    statusItem.show();
  }

  manager.onDidChange(() => {
    void updateStatusBar();
    void inspectors.refreshAll();
  });

  const register = (command: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  register("strata.refreshDatabases", async () => {
    await manager.refresh();
  });

  register("strata.startHost", async (node: ExplorerNode & { type: "database" }) => {
    try {
      await manager.startHost(node.dbPath);
      void vscode.window.showInformationMessage(`StrataDB: hosting ${node.dbPath}`);
    } catch (error) {
      showHostError(error);
    }
  });

  register("strata.stopHost", async (node: ExplorerNode & { type: "database" }) => {
    await manager.stopHost(node.dbPath);
  });

  register("strata.loadMore", async (node: ExplorerNode & { type: "load-more" }) => {
    await tree.model.loadMore(node.parentKey);
    tree.refresh();
  });

  register("strata.inspectRow", async (node: ExplorerNode) => {
    const scope = "scope" in node ? node.scope : null;
    if (!scope) return;
    const session = manager.session(scope.dbPath);
    if (!session) return;
    try {
      if (node.type === "kv-entry") {
        const render = () => inspectKv(session.client, scope, node.key);
        const inspection = await render();
        await inspectors.open(inspection.title, inspection.content, async () => (await render()).content);
      } else if (node.type === "json-doc") {
        const render = () => inspectJson(session.client, scope, node.docId);
        const inspection = await render();
        await inspectors.open(inspection.title, inspection.content, async () => (await render()).content);
      } else if (node.type === "event") {
        const inspection = inspectEvent(scope, {
          eventType: node.eventType,
          version: node.version,
          timestamp: node.timestamp,
        });
        await inspectors.open(inspection.title, inspection.content);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        `StrataDB: inspect failed — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  register("strata.copyWireJson", async (node: ExplorerNode) => {
    const text = wireJsonFor(node);
    if (text) {
      await vscode.env.clipboard.writeText(text);
      void vscode.window.setStatusBarMessage("StrataDB: wire JSON copied", 2_000);
    }
  });

  register("strata.copyCli", async (node: ExplorerNode) => {
    const text = cliFor(node);
    if (text) {
      await vscode.env.clipboard.writeText(text);
      void vscode.window.setStatusBarMessage("StrataDB: CLI command copied", 2_000);
    } else {
      void vscode.window.showWarningMessage(
        "StrataDB: no CLI form for this item (non-text key or wire-only command) — use Copy as Wire JSON.",
      );
    }
  });

  register("strata.runDoctor", async (node: ExplorerNode & { type: "database" }) => {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "StrataDB: Run Doctor executes the strata binary and is disabled in untrusted workspaces (attach-only).",
      );
      return;
    }
    if (!binary) {
      showHostError(new StrataBinaryMissingError());
      return;
    }
    try {
      const report = execFileSync(binary, ["--db", node.dbPath, "doctor"], {
        encoding: "utf8",
        timeout: 15_000,
      });
      output.appendLine(`--- strata doctor: ${node.dbPath} ---\n${report}`);
      output.show(true);
    } catch (error) {
      output.appendLine(`doctor failed: ${error instanceof Error ? error.message : String(error)}`);
      output.show(true);
    }
  });

  // First pass, then keep current (F1.4: ticks drive everything afterwards).
  await manager.refresh();
  await updateStatusBar();
}

function wireJsonFor(node: ExplorerNode): string | null {
  if (node.type === "kv-entry") {
    return copyAsWireJson("kv.get", { key: node.key }, { branch: node.scope.branch, space: node.scope.space });
  }
  if (node.type === "json-doc") {
    return copyAsWireJson(
      "json.get",
      { key: node.docId, path: "$" },
      { branch: node.scope.branch, space: node.scope.space },
    );
  }
  return null;
}

function cliFor(node: ExplorerNode): string | null {
  if (node.type === "kv-entry") {
    return copyAsCli("kv.get", [keyText(node.key)], { branch: node.scope.branch, space: node.scope.space });
  }
  if (node.type === "json-doc") {
    return copyAsCli("json.get", [node.docId, "$"], { branch: node.scope.branch, space: node.scope.space });
  }
  return null;
}

function resolveBinaryFromSettings(): string | null {
  // AR-7.5: machine scope is declared in the manifest; the inspect() check
  // keeps a workspace-level override from ever being honored.
  const inspected = vscode.workspace.getConfiguration("strata").inspect<string>("binaryPath");
  const configured = inspected?.globalValue ?? undefined;
  if (configured && fs.existsSync(configured)) return configured;
  try {
    const found = execFileSync("which", ["strata"], { encoding: "utf8" }).trim();
    return found || null;
  } catch {
    return null;
  }
}

function showHostError(error: unknown): void {
  if (error instanceof WorkspaceNotTrustedError) {
    void vscode.window.showWarningMessage(`StrataDB: ${error.message}`);
  } else if (error instanceof StrataBinaryMissingError) {
    void vscode.window
      .showWarningMessage(`StrataDB: ${error.message}`, "Open Settings")
      .then((choice) => {
        if (choice) void vscode.commands.executeCommand("workbench.action.openSettings", "strata.binaryPath");
      });
  } else {
    void vscode.window.showErrorMessage(
      `StrataDB: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function deactivate(): void {
  // Managed hosts are stopped via the manager disposable (AR-8.4); read-only
  // means there is never anything to flush.
}
