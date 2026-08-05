/**
 * The VS Code TreeDataProvider — a thin wrapper over ExplorerModel (which
 * holds all the logic and is tested against the fake owner). Codicons keep
 * primitive identity independent of color (N10).
 */
import * as vscode from "vscode";
import type { DatabaseManager } from "../attach/manager";
import { ExplorerModel, nodeKey, type ExplorerNode, type Primitive } from "../explorer/model";
import type { ViewContextStore } from "../state/viewContext";

const PRIMITIVE_ICONS: Record<Primitive, string> = {
  kv: "symbol-key",
  json: "json",
  events: "pulse",
  vectors: "symbol-array",
  graph: "type-hierarchy",
};

const STATE_ICONS: Record<string, string> = {
  attachable: "database",
  unowned: "debug-disconnect",
  "owned-unreachable": "lock",
  "at-capacity": "warning",
  "version-mismatch": "warning",
  "pre-v1-layout": "history",
  "not-a-database": "question",
};

export class StrataTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private readonly emitter = new vscode.EventEmitter<ExplorerNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  readonly model: ExplorerModel;

  constructor(
    private readonly manager: DatabaseManager,
    viewContext: ViewContextStore | null = null,
  ) {
    this.model = new ExplorerModel(manager, viewContext);
    manager.onDidChange((dbPath) => {
      this.model.invalidate(dbPath);
      this.emitter.fire(undefined);
    });
    viewContext?.onDidChange((dbPath) => {
      this.model.invalidate(dbPath);
      this.emitter.fire(undefined);
    });
  }

  refresh(): void {
    this.model.invalidate();
    this.emitter.fire(undefined);
  }

  getChildren(node?: ExplorerNode): Promise<ExplorerNode[]> {
    return this.model.children(node ?? null).catch((error: unknown) => [
      { type: "message", text: `error: ${error instanceof Error ? error.message : String(error)}` } as ExplorerNode,
    ]);
  }

  getTreeItem(node: ExplorerNode): vscode.TreeItem {
    switch (node.type) {
      case "database": {
        const item = new vscode.TreeItem(
          node.label,
          node.attached
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        );
        item.id = nodeKey(node);
        const managed = node.managed ? " · managed" : "";
        // F2.2: the UI states clearly when it shows historical state.
        const scrubbed = node.scrubbedTo ? ` · ⏪ as of ${node.scrubbedTo}` : "";
        item.description = `${node.description}${managed}${scrubbed}`;
        item.tooltip = node.dbPath;
        item.iconPath = new vscode.ThemeIcon(STATE_ICONS[node.stateKind] ?? "database");
        item.contextValue = `strata-db:${node.stateKind}${node.managed ? ":managed" : ""}`;
        return item;
      }
      case "branch": {
        const item = new vscode.TreeItem(node.branch, vscode.TreeItemCollapsibleState.Collapsed);
        item.id = nodeKey(node);
        item.iconPath = new vscode.ThemeIcon(node.active ? "circle-filled" : "git-branch");
        const parts = [
          ...(node.active ? ["selected"] : []),
          ...(node.status !== "active" ? [node.status] : []),
        ];
        item.description = parts.join(" · ") || undefined;
        item.contextValue = node.active ? "strata-branch:active" : "strata-branch";
        return item;
      }
      case "space": {
        const item = new vscode.TreeItem(node.space, vscode.TreeItemCollapsibleState.Collapsed);
        item.id = nodeKey(node);
        item.iconPath = new vscode.ThemeIcon("folder");
        item.contextValue = "strata-space";
        return item;
      }
      case "primitive": {
        const item = new vscode.TreeItem(node.primitive, vscode.TreeItemCollapsibleState.Collapsed);
        item.id = nodeKey(node);
        item.description = node.count !== null ? String(node.count) : undefined;
        item.iconPath = new vscode.ThemeIcon(PRIMITIVE_ICONS[node.primitive]);
        item.contextValue = `strata-primitive:${node.primitive}`;
        // F1.2: the tree is navigation; opening a primitive lands in its view.
        item.command = { command: "strata.openView", title: "Open View", arguments: [node] };
        return item;
      }
      case "kv-entry": {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.description = node.preview;
        item.tooltip = `version ${node.version}`;
        item.iconPath = new vscode.ThemeIcon("symbol-field");
        item.contextValue = "strata-kv-entry";
        item.command = { command: "strata.inspectRow", title: "Inspect Row", arguments: [node] };
        return item;
      }
      case "json-doc": {
        const item = new vscode.TreeItem(node.docId, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("file-code");
        item.contextValue = "strata-json-doc";
        item.command = { command: "strata.inspectRow", title: "Inspect Row", arguments: [node] };
        return item;
      }
      case "event": {
        const item = new vscode.TreeItem(
          `${node.eventType}`,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = `v${node.version}`;
        item.iconPath = new vscode.ThemeIcon("circle-small-filled");
        item.contextValue = "strata-event";
        item.command = { command: "strata.inspectRow", title: "Inspect Row", arguments: [node] };
        return item;
      }
      case "vector-collection": {
        const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
        item.description = `${node.count} × ${node.dimension}d ${node.metric}`;
        item.iconPath = new vscode.ThemeIcon("symbol-array");
        item.contextValue = "strata-vector-collection";
        return item;
      }
      case "graph": {
        const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("type-hierarchy");
        item.contextValue = "strata-graph";
        return item;
      }
      case "load-more": {
        const item = new vscode.TreeItem(
          `Load more… (${node.loaded} loaded)`,
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon("ellipsis");
        item.command = { command: "strata.loadMore", title: "Load More", arguments: [node] };
        return item;
      }
      case "message": {
        const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(node.teaching === "retention" ? "history" : "info");
        return item;
      }
    }
  }
}
