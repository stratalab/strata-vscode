import * as vscode from "vscode";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { IDL_STAMPS, STRATA_CORE_REV } from "./generated";
import { createDurableDatabase, type CreateDatabaseError } from "./attach/create";
import { describeState } from "./attach/attachment";
import { classifyLayout } from "./attach/discovery";
import { DatabaseManager, normalizeDatabasePath, normalizeDatabasePaths } from "./attach/manager";
import { ManagedHostManager, WorkspaceNotTrustedError, StrataBinaryMissingError, type ManagedHostRecord } from "./attach/managedHost";
import { StrataTreeProvider } from "./ui/explorerView";
import { InspectorDocuments, INSPECT_SCHEME } from "./ui/inspectorDoc";
import { renderStatus, type DatabaseStatus } from "./ui/statusModel";
import { ConsoleUi } from "./ui/consoleUi";
import { TimeTravelUi } from "./ui/timeTravelUi";
import { ConsoleHistoryStore, type ConsoleHistoryEntry } from "./console/historyStore";
import { ViewContextStore } from "./state/viewContext";
import { ViewHost } from "./ui/webviewHost";
import { EcosystemUi } from "./ui/ecosystemUi";
import { HubBrowserHost } from "./ui/hubBrowserHost";
import { StatusCenterHost } from "./ui/statusCenterHost";
import { AgentHelperViewProvider } from "./ui/agentHelperView";
import { BranchWorkflowUi } from "./ui/branchWorkflowUi";
import {
  mcpSetupForDatabase,
  primitiveDocsUrl,
  starterSnippet,
  type AgentScope,
  type StarterLanguage,
} from "./agent/helpers";
import { inspectEvent, inspectJson, inspectKv } from "./explorer/inspector";
import { copyAsCli, copyAsWireJson } from "./explorer/copyAs";
import { keyText } from "./explorer/decode";
import type { ExplorerNode } from "./explorer/model";
import type { ClientIdentity } from "./wire/protocol";

const MANAGED_HOSTS_KEY = "strata.managedHosts";
const BRANCHES_KEY = "strata.selectedBranches";
const CONSOLE_HISTORY_KEY = "strata.consoleHistory";
const REMOVED_DATABASES_KEY = "strata.removedDatabases";

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

  // F2.1/AR-8.3: selected branch persists; the scrubber is session-only.
  const viewContext = new ViewContextStore({
    loadBranches: () => context.workspaceState.get<Record<string, string>>(BRANCHES_KEY, {}),
    saveBranches: (map) => void context.workspaceState.update(BRANCHES_KEY, map),
  });

  const manager = new DatabaseManager(
    {
      workspaceRoots: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      explicitDatabases: readConfiguredDatabases(),
      ignoredDatabases: readRemovedDatabases(),
      identity,
    },
    hosts,
  );
  context.subscriptions.push({ dispose: () => void manager.dispose() });
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("strata.databases")) return;
      manager.setExplicitDatabases(readConfiguredDatabases());
      void manager.refresh();
    }),
  );

  // F2.2: tick refresh is suspended while a database is scrubbed.
  manager.setTickGate((dbPath) => !viewContext.isScrubbed(dbPath));

  const tree = new StrataTreeProvider(manager, viewContext, identity);
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

  const consoleHistory = new ConsoleHistoryStore({
    loadConsoleHistory: () => context.workspaceState.get<ConsoleHistoryEntry[]>(CONSOLE_HISTORY_KEY, []),
    saveConsoleHistory: (entries) => void context.workspaceState.update(CONSOLE_HISTORY_KEY, entries),
  });
  const consoleUi = new ConsoleUi(manager, viewContext, inspectors, consoleHistory);
  const viewHost = new ViewHost(context, manager, viewContext, binary);
  const ecosystem = new EcosystemUi(context, manager, binary, connectDatabasePathFlow);
  async function revealDatabase(dbPath: string): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.strata");
    tree.refresh();
    const nodes = await tree.getChildren();
    const node = nodes.find((candidate) => candidate.type === "database" && candidate.dbPath === normalizeDatabasePath(dbPath));
    if (node) await treeView.reveal(node, { focus: true, select: true, expand: true });
  }
  const hubBrowser = new HubBrowserHost(
    context,
    binary,
    defaultDatabaseParentPath,
    connectDatabasePathFlow,
    (dbPath, branch) => viewHost.open("space", dbPath, branch || "default", "default"),
    revealDatabase,
  );
  const statusCenter = new StatusCenterHost(context, binary, manager, viewContext, identity, {
    registerAgents: () => ecosystem.registerAgentsCommand(),
    removeAgentRegistrations: () => ecosystem.removeAgentsCommand(),
    connectDatabase: () => connectDatabaseFlow(),
    createDatabase: () => createDatabaseFlow(),
    browseHub: () => hubBrowser.open(),
  });
  const agentHelperView = new AgentHelperViewProvider(context, binary, manager, viewContext, {
    registerAgents: () => ecosystem.registerAgentsCommand(),
    connectDatabase: () => connectDatabaseFlow(),
    browseHub: () => hubBrowser.open(),
    openStatus: () => statusCenter.open(),
  });
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("strataAgent", agentHelperView));
  const timeTravelUi = new TimeTravelUi(manager, viewContext, inspectors);
  const branchWorkflowUi = new BranchWorkflowUi(
    binary,
    manager,
    viewContext,
    inspectors,
    (dbPath, branch, space) => viewHost.open("space", dbPath, branch, space),
  );

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusItem.command = "strata.openStatus";
  context.subscriptions.push(statusItem);

  // U11: the tooltip's pulse line — change events bucketed per minute.
  const changeLog = new Map<string, number[]>();
  const ACTIVITY_WINDOW_MS = 8 * 60_000;
  function recordChange(dbPath: string): void {
    const now = Date.now();
    const log = (changeLog.get(dbPath) ?? []).filter((t) => now - t < ACTIVITY_WINDOW_MS);
    log.push(now);
    changeLog.set(dbPath, log);
  }
  function activityBuckets(dbPath: string): number[] {
    const now = Date.now();
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const t of changeLog.get(dbPath) ?? []) {
      const minutesAgo = Math.floor((now - t) / 60_000);
      if (minutesAgo < 8) buckets[7 - minutesAgo]! += 1;
    }
    return buckets;
  }

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
        scrubbedTo: viewContext.describeAsOf(entry.dbPath),
        activity: activityBuckets(entry.dbPath),
        ...(ipcStatus !== undefined ? { ipcStatus } : {}),
      });
    }
    const rendered = renderStatus(databases, identity);
    if (!rendered.visible) {
      statusItem.hide();
    } else {
      statusItem.text = rendered.text;
      const tooltip = new vscode.MarkdownString(rendered.tooltipMarkdown);
      tooltip.supportThemeIcons = true;
      statusItem.tooltip = tooltip;
      // SB-1 / SIG-2: the window-level "you are looking at the past" tint.
      statusItem.backgroundColor = rendered.warning
        ? new vscode.ThemeColor("statusBarItem.warningBackground")
        : undefined;
      statusItem.show();
    }
    // TR-6: the view badge is the native "something is alive here" signal.
    const connectedCount = manager.list().filter((e) => manager.session(e.dbPath)).length;
    treeView.badge =
      connectedCount > 0
        ? { value: connectedCount, tooltip: `${connectedCount} connected` }
        : undefined;
  }

  manager.onDidChange((dbPath) => {
    if (dbPath) recordChange(dbPath);
    void updateStatusBar();
    void inspectors.refreshAll();
  });
  // Scrub moves re-render the window-level state too (SB-1).
  viewContext.onDidChange(() => void updateStatusBar());

  const register = (command: string, handler: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  async function addConfiguredDatabase(dbPath: string): Promise<string> {
    const normalized = normalizeDatabasePath(dbPath);
    await setRemovedDatabases(readRemovedDatabases().filter((removed) => removed !== normalized));
    const next = normalizeDatabasePaths([...readConfiguredDatabases(), normalized]);
    const config = vscode.workspace.getConfiguration("strata");
    await config.update("databases", next, configurationTarget());
    manager.setExplicitDatabases(next);
    return normalized;
  }

  async function removeConfiguredDatabase(dbPath: string): Promise<string> {
    const normalized = normalizeDatabasePath(dbPath);
    const next = readConfiguredDatabases().filter((configured) => configured !== normalized);
    const config = vscode.workspace.getConfiguration("strata");
    await config.update("databases", next, configurationTarget());
    manager.setExplicitDatabases(next);
    return normalized;
  }

  function readRemovedDatabases(): string[] {
    return normalizeDatabasePaths(context.workspaceState.get<string[]>(REMOVED_DATABASES_KEY, []));
  }

  async function setRemovedDatabases(dbPaths: string[]): Promise<void> {
    const normalized = normalizeDatabasePaths(dbPaths);
    await context.workspaceState.update(REMOVED_DATABASES_KEY, normalized);
    manager.setIgnoredDatabases(normalized);
  }

  async function startHostFlow(dbPath: string, announce = true): Promise<boolean> {
    try {
      await manager.startHost(dbPath);
      if (announce) void vscode.window.showInformationMessage(`StrataDB: hosting ${dbPath}`);
      return true;
    } catch (error) {
      showHostError(error);
      return false;
    }
  }

  async function connectDatabasePathFlow(dbPath: string): Promise<void> {
    dbPath = normalizeDatabasePath(dbPath);
    const layout = classifyLayout(dbPath);
    if (layout === "not-a-database") {
      const choice = await vscode.window.showWarningMessage(
        `StrataDB: ${dbPath} does not look like a Strata database.`,
        "Connect Anyway",
      );
      if (choice !== "Connect Anyway") return;
    }

    await addConfiguredDatabase(dbPath);
    const entry = await manager.connectDatabase(dbPath);
    await vscode.commands.executeCommand("workbench.view.extension.strata");

    if (entry.state.kind === "attachable" && manager.session(entry.dbPath)) {
      void vscode.window.showInformationMessage(`StrataDB: connected ${entry.dbPath}`);
    } else if (entry.state.kind === "unowned") {
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage(
          `StrataDB: added ${entry.dbPath}, but this workspace is untrusted so StrataDB cannot start a host.`,
        );
      } else if (!binary) {
        showHostError(new StrataBinaryMissingError());
      } else if (await startHostFlow(entry.dbPath, false)) {
        void vscode.window.showInformationMessage(`StrataDB: connected ${entry.dbPath}`);
      }
    } else {
      void vscode.window.showWarningMessage(`StrataDB: added ${entry.dbPath}; ${describeState(entry.state)}`);
    }
  }

  async function connectDatabaseFlow(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      title: "Connect Existing Strata Database",
      openLabel: "Connect",
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: defaultDatabaseParentUri(),
    });
    const uri = picked?.[0];
    if (!uri) return;
    await connectDatabasePathFlow(uri.fsPath);
  }

  async function createDatabaseFlow(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "StrataDB: Create New Database executes the strata binary and writes a database, so it is disabled in untrusted workspaces.",
      );
      return;
    }
    if (!binary) {
      showHostError(new StrataBinaryMissingError());
      return;
    }

    const uri = await vscode.window.showSaveDialog({
      title: "Create New Strata Database",
      saveLabel: "Create Database",
      defaultUri: vscode.Uri.file(path.join(defaultDatabaseParentPath(), "new")),
    });
    if (!uri) return;

    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Creating Strata database…" },
      () => createDurableDatabase(binary, uri.fsPath),
    );
    if (!result.ok) {
      const actions = result.error.suggestedFix === "Use Connect Existing Database instead." ? ["Connect Existing Database"] : [];
      const choice = await vscode.window.showErrorMessage(formatCreateError(result.error), ...actions);
      if (choice === "Connect Existing Database") await connectDatabaseFlow();
      return;
    }

    await addConfiguredDatabase(result.dbPath);
    await manager.addExplicitDatabase(result.dbPath);
    await vscode.commands.executeCommand("workbench.view.extension.strata");
    const hosted = await startHostFlow(result.dbPath, false);
    if (hosted) {
      void vscode.window.showInformationMessage(`StrataDB: created and connected ${result.dbPath}`);
    } else {
      await manager.refreshOne(result.dbPath);
    }
  }

  async function disconnectDatabaseFlow(node: ExplorerNode & { type: "database" }): Promise<void> {
    const entry = await manager.disconnectDatabase(node.dbPath);
    viewContext.setAsOf(entry.dbPath, null);
    void vscode.window.showInformationMessage(`StrataDB: disconnected ${entry.dbPath}`);
  }

  async function removeDatabaseFlow(node: ExplorerNode & { type: "database" }): Promise<void> {
    const dbPath = normalizeDatabasePath(node.dbPath);
    const choice = await vscode.window.showWarningMessage(
      `Remove ${dbPath} from StrataDB? This does not delete the database folder.`,
      "Remove Database",
    );
    if (choice !== "Remove Database") return;

    await setRemovedDatabases([...readRemovedDatabases(), dbPath]);
    await removeConfiguredDatabase(dbPath);
    viewContext.setAsOf(dbPath, null);
    await manager.removeDatabase(dbPath);
    void vscode.window.showInformationMessage(`StrataDB: removed ${dbPath}`);
  }

  function dbPathForAgent(node?: ExplorerNode): string | null {
    if (!node) return null;
    if (node.type === "database" || node.type === "branch" || node.type === "space") return node.dbPath;
    if ("scope" in node) return node.scope.dbPath;
    return null;
  }

  function agentScopeFor(node?: ExplorerNode): AgentScope | null {
    if (!node) return null;
    if (node.type === "database") {
      return {
        dbPath: node.dbPath,
        branch: viewContext.branchFor(node.dbPath),
        space: "default",
      };
    }
    if (node.type === "branch") {
      return { dbPath: node.dbPath, branch: node.branch, space: "default" };
    }
    if (node.type === "space") {
      return { dbPath: node.dbPath, branch: node.branch, space: node.space };
    }
    if (node.type === "primitive") {
      return { ...node.scope, primitive: node.primitive };
    }
    if ("scope" in node) return node.scope;
    return null;
  }

  register("strata.refreshDatabases", async () => {
    await manager.refresh();
  });

  register("strata.connectDatabase", () => connectDatabaseFlow());

  register("strata.createDatabase", () => createDatabaseFlow());

  register("strata.connectDatabaseItem", async (node: ExplorerNode & { type: "database" }) => {
    await connectDatabasePathFlow(node.dbPath);
  });

  register("strata.disconnectDatabase", async (node: ExplorerNode & { type: "database" }) => {
    await disconnectDatabaseFlow(node);
  });

  register("strata.removeDatabase", async (node: ExplorerNode & { type: "database" }) => {
    await removeDatabaseFlow(node);
  });

  // SB-3: the status item's click-through — databases, then actions.
  register("strata.statusMenu", async () => {
    interface MenuItem extends vscode.QuickPickItem {
      action?: () => unknown;
    }
    const items: MenuItem[] = [];
    for (const entry of manager.list()) {
      const name = entry.dbPath.split("/").pop() ?? entry.dbPath;
      const asOf = viewContext.describeAsOf(entry.dbPath);
      items.push({
        label: `$(database) ${name}`,
        description: `${entry.state.kind} · ${viewContext.branchFor(entry.dbPath)}${asOf ? ` · as of ${asOf}` : ""}`,
        action: () => vscode.commands.executeCommand("workbench.view.extension.strata"),
      });
      if (asOf) {
        items.push({
          label: `$(debug-continue) Back to now — ${name}`,
          action: () => {
            viewContext.setAsOf(entry.dbPath, null);
            manager.poke(entry.dbPath);
          },
        });
      }
    }
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    items.push({
      label: "$(list-tree) Open the Strata explorer",
      action: () => vscode.commands.executeCommand("workbench.view.extension.strata"),
    });
    items.push({
      label: "$(play) Run a command…",
      action: () => vscode.commands.executeCommand("strata.runCommand"),
    });
    const picked = await vscode.window.showQuickPick(items, {
      title: "StrataDB",
      placeHolder: "Databases and actions",
    });
    if (picked?.action) await picked.action();
  });

  register("strata.startHost", async (node: ExplorerNode & { type: "database" }) => {
    await startHostFlow(node.dbPath);
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
        const render = () => inspectKv(session.client, scope, node.key, viewContext.asOfFor(scope.dbPath));
        const inspection = await render();
        await inspectors.open(inspection.title, inspection.content, async () => (await render()).content);
      } else if (node.type === "json-doc") {
        const render = () => inspectJson(session.client, scope, node.docId, viewContext.asOfFor(scope.dbPath));
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

  register("strata.cloneDataset", () => ecosystem.cloneFlow());
  register("strata.browseHub", () => hubBrowser.open());
  register("strata.openStatus", () => statusCenter.open());
  register("strata.copyMcpSetup", async (node: ExplorerNode) => {
    const dbPath = dbPathForAgent(node);
    if (!dbPath) return;
    await vscode.env.clipboard.writeText(mcpSetupForDatabase(dbPath, binary));
    void vscode.window.setStatusBarMessage("StrataDB: MCP setup copied", 2_000);
  });
  register("strata.copyStarterSnippet", async (node: ExplorerNode) => {
    const scope = agentScopeFor(node);
    if (!scope) return;
    const picked = await vscode.window.showQuickPick<{
      label: string;
      description: string;
      language: StarterLanguage;
    }>(
      [
        { label: "$(symbol-method) TypeScript", description: "Node child_process starter", language: "typescript" },
        { label: "$(symbol-method) Python", description: "subprocess starter", language: "python" },
      ],
      { title: "Copy Strata starter snippet" },
    );
    if (!picked) return;
    await vscode.env.clipboard.writeText(starterSnippet(picked.language, scope, binary));
    void vscode.window.setStatusBarMessage(`StrataDB: ${picked.language} starter copied`, 2_000);
  });
  register("strata.openPrimitiveDocs", (node: ExplorerNode) => {
    if (node.type !== "primitive") return;
    void vscode.env.openExternal(vscode.Uri.parse(primitiveDocsUrl(node.primitive)));
  });
  register("strata.registerAgents", () => ecosystem.registerAgentsCommand());
  register("strata.removeAgentRegistrations", () => ecosystem.removeAgentsCommand());

  register("strata.openView", (node: ExplorerNode) => {
    if (node.type === "space") {
      viewHost.open("space", node.dbPath, node.branch, node.space);
    } else if (node.type === "primitive") {
      viewHost.open(node.primitive, node.scope.dbPath, node.scope.branch, node.scope.space);
    } else if (node.type === "kv-entry") {
      viewHost.open("kv", node.scope.dbPath, node.scope.branch, node.scope.space, {
        type: "kv-key",
        key: node.key,
      });
    } else if (node.type === "vector-collection") {
      viewHost.open("vectors", node.scope.dbPath, node.scope.branch, node.scope.space);
    } else if (node.type === "graph") {
      viewHost.open("graph", node.scope.dbPath, node.scope.branch, node.scope.space);
    }
  });

  register("strata.runCommand", () => consoleUi.runCommandFlow());
  register("strata.rawRequest", () => consoleUi.rawRequestFlow());
  register("strata.sendRawRequest", () => consoleUi.sendRawFlow());
  register("strata.consoleHistory", () => consoleUi.historyFlow());

  register("strata.selectBranch", async (node?: ExplorerNode) => {
    const dbPath =
      node && (node.type === "database" || node.type === "branch")
        ? node.dbPath
        : await pickConnectedDb(manager);
    if (dbPath) await timeTravelUi.selectBranchFlow(dbPath);
  });

  register("strata.timeTravel", async (node?: ExplorerNode) => {
    const dbPath = node && node.type === "database" ? node.dbPath : await pickConnectedDb(manager);
    if (dbPath) await timeTravelUi.timeTravelFlow(dbPath);
  });

  register("strata.keyHistory", (node: ExplorerNode) => timeTravelUi.keyHistoryFlow(node));
  register("strata.compareBranches", (node: ExplorerNode) => timeTravelUi.compareBranchesFlow(node));
  register("strata.forkBranch", (node?: ExplorerNode) => branchWorkflowUi.forkBranchFlow(node));
  register("strata.diffBranches", (node?: ExplorerNode) => branchWorkflowUi.diffBranchesFlow(node));
  register("strata.copyBranchHandoff", (node?: ExplorerNode) => branchWorkflowUi.copyBranchHandoffFlow(node));

  register("strata.runDoctor", async (node: ExplorerNode & { type: "database" }) => {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "StrataDB: Run Doctor executes the strata binary and is disabled in untrusted workspaces (connect-only).",
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

  // F6: agent enablement — native provider plus file-based registration.
  ecosystem.registerNativeProvider();
  void ecosystem.autoRegisterFileAgents();
}

async function pickConnectedDb(manager: DatabaseManager): Promise<string | null> {
  const connected = manager.list().filter((e) => manager.session(e.dbPath));
  if (connected.length === 0) return null;
  if (connected.length === 1) return connected[0]!.dbPath;
  const picked = await vscode.window.showQuickPick(
    connected.map((e) => ({ label: e.dbPath.split("/").pop() ?? e.dbPath, description: e.dbPath })),
    { title: "Which database?" },
  );
  return picked?.description ?? null;
}

function readConfiguredDatabases(): string[] {
  return normalizeDatabasePaths(vscode.workspace.getConfiguration("strata").get<string[]>("databases", []));
}

function configurationTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

function defaultDatabaseParentPath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.env.HOME ?? process.cwd();
}

function defaultDatabaseParentUri(): vscode.Uri {
  return vscode.Uri.file(defaultDatabaseParentPath());
}

function formatCreateError(error: CreateDatabaseError): string {
  return `StrataDB create failed (${error.code}): ${error.message}${error.suggestedFix ? ` — ${error.suggestedFix}` : ""}`;
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
