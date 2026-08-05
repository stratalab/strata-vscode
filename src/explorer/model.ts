/**
 * The explorer tree model (F1.1–F1.5), vscode-free: databases → branches →
 * spaces → primitives → entries, counts via `*.count`, entries via
 * cursor-paginated reads with capped pages and explicit "load more". The
 * VS Code TreeDataProvider is a thin wrapper over this.
 */
import type { DatabaseManager, DatabaseSession } from "../attach/manager";
import { describeState } from "../attach/attachment";
import type { WireBase64 } from "../wire/bytes";
import { keyLabel, previewValue } from "./decode";

export const PAGE_SIZE_DEFAULT = 100;
export const PAGE_SIZE_MAX = 1_000;

export type Primitive = "kv" | "json" | "events" | "vectors" | "graph";
export const PRIMITIVES: readonly Primitive[] = ["kv", "json", "events", "vectors", "graph"];

export interface Scope {
  dbPath: string;
  branch: string;
  space: string;
}

export type ExplorerNode =
  | { type: "database"; dbPath: string; label: string; stateKind: string; description: string; attached: boolean; managed: boolean }
  | { type: "branch"; dbPath: string; branch: string; status: string }
  | { type: "space"; dbPath: string; branch: string; space: string }
  | { type: "primitive"; scope: Scope; primitive: Primitive; count: number | null }
  | { type: "kv-entry"; scope: Scope; key: WireBase64; label: string; preview: string; version: number }
  | { type: "json-doc"; scope: Scope; docId: string }
  | { type: "event"; scope: Scope; eventType: string; version: number; timestamp: number }
  | { type: "vector-collection"; scope: Scope; name: string; dimension: number; metric: string; count: number }
  | { type: "graph"; scope: Scope; name: string }
  | { type: "load-more"; parentKey: string; loaded: number }
  | { type: "message"; text: string };

/** Stable key per paginated parent — page state and load-more routing. */
export function nodeKey(node: ExplorerNode): string {
  switch (node.type) {
    case "database":
      return `db:${node.dbPath}`;
    case "branch":
      return `br:${node.dbPath}:${node.branch}`;
    case "space":
      return `sp:${node.dbPath}:${node.branch}:${node.space}`;
    case "primitive":
      return `pr:${node.scope.dbPath}:${node.scope.branch}:${node.scope.space}:${node.primitive}`;
    default:
      return `leaf:${JSON.stringify(node)}`;
  }
}

interface PageState {
  items: ExplorerNode[];
  cursor: unknown;
  hasMore: boolean;
}

export class ExplorerModel {
  private pages = new Map<string, PageState>();

  constructor(
    private readonly manager: DatabaseManager,
    private readonly pageSize: number = PAGE_SIZE_DEFAULT,
  ) {
    if (pageSize > PAGE_SIZE_MAX) throw new Error(`page size ${pageSize} exceeds cap ${PAGE_SIZE_MAX}`);
  }

  /** Drops cached pages — called on tick-driven refresh (F1.4). */
  invalidate(dbPath?: string): void {
    if (!dbPath) {
      this.pages.clear();
      return;
    }
    for (const key of [...this.pages.keys()]) {
      if (key.includes(dbPath)) this.pages.delete(key);
    }
  }

  async children(node: ExplorerNode | null): Promise<ExplorerNode[]> {
    if (node === null) return this.databases();
    switch (node.type) {
      case "database":
        return node.attached ? this.branches(node.dbPath) : [];
      case "branch":
        return this.spaces(node.dbPath, node.branch);
      case "space":
        return this.primitives({ dbPath: node.dbPath, branch: node.branch, space: node.space });
      case "primitive":
        return this.entriesPage(node, false);
      default:
        return [];
    }
  }

  /** Explicit "load more" (F1.5): appends the next page under this parent. */
  async loadMore(parentKey: string): Promise<void> {
    const primitive = this.primitiveFromKey(parentKey);
    if (primitive) await this.entriesPage(primitive, true);
  }

  private databases(): ExplorerNode[] {
    const entries = this.manager.list();
    if (entries.length === 0) {
      return [{ type: "message", text: "No Strata databases found in this workspace." }];
    }
    return entries.map((entry) => ({
      type: "database",
      dbPath: entry.dbPath,
      label: entry.dbPath.split("/").filter(Boolean).pop() ?? entry.dbPath,
      stateKind: entry.state.kind,
      description: describeState(entry.state),
      attached: entry.state.kind === "attachable" && this.manager.session(entry.dbPath) !== undefined,
      managed: entry.managed,
    }));
  }

  private requireSession(dbPath: string): DatabaseSession {
    const session = this.manager.session(dbPath);
    if (!session) throw new Error(`no live session for ${dbPath}`);
    return session;
  }

  private async branches(dbPath: string): Promise<ExplorerNode[]> {
    const session = this.requireSession(dbPath);
    const response = await session.client.request("branch.list", {}, { branch: "default" });
    return response.data.items.map((item) => ({
      type: "branch",
      dbPath,
      branch: item.name,
      status: String(item.status),
    }));
  }

  private async spaces(dbPath: string, branch: string): Promise<ExplorerNode[]> {
    const session = this.requireSession(dbPath);
    const response = await session.client.request("space.list", { branch }, { branch });
    return response.data.items.map((space) => ({ type: "space", dbPath, branch, space }));
  }

  private async primitives(scope: Scope): Promise<ExplorerNode[]> {
    const session = this.requireSession(scope.dbPath);
    const context = { branch: scope.branch, space: scope.space };
    const payload = { branch: scope.branch, space: scope.space };
    const counts = await Promise.all([
      session.client.request("kv.count", payload, context).then((r) => r.data),
      session.client.request("json.count", payload, context).then((r) => r.data),
      session.client.request("event.count", payload, context).then((r) => r.data),
      // vector.count is per-collection; the primitive level counts collections.
      session.client
        .request("vector.collection.list", payload, context)
        .then((r) => r.data.items.length),
      Promise.resolve(null), // graphs enumerate under the node; no space-level count
    ]);
    return PRIMITIVES.map((primitive, at) => ({
      type: "primitive",
      scope,
      primitive,
      count: counts[at] as number | null,
    }));
  }

  private primitiveFromKey(parentKey: string): (ExplorerNode & { type: "primitive" }) | null {
    const match = /^pr:(.+):([^:]+):([^:]+):(kv|json|events|vectors|graph)$/.exec(parentKey);
    if (!match) return null;
    return {
      type: "primitive",
      scope: { dbPath: match[1]!, branch: match[2]!, space: match[3]! },
      primitive: match[4] as Primitive,
      count: null,
    };
  }

  private async entriesPage(
    node: ExplorerNode & { type: "primitive" },
    append: boolean,
  ): Promise<ExplorerNode[]> {
    const key = nodeKey(node);
    const existing = this.pages.get(key);
    if (!append && existing) return this.withLoadMore(key, existing);
    const cursor = append ? existing?.cursor : undefined;

    const page = await this.fetchPage(node, cursor);
    const state: PageState = append
      ? {
          items: [...(existing?.items ?? []), ...page.items],
          cursor: page.cursor,
          hasMore: page.hasMore,
        }
      : { items: page.items, cursor: page.cursor, hasMore: page.hasMore };
    this.pages.set(key, state);
    return this.withLoadMore(key, state);
  }

  private withLoadMore(key: string, state: PageState): ExplorerNode[] {
    if (state.items.length === 0) return [{ type: "message", text: "empty" }];
    return state.hasMore
      ? [...state.items, { type: "load-more", parentKey: key, loaded: state.items.length }]
      : state.items;
  }

  private async fetchPage(
    node: ExplorerNode & { type: "primitive" },
    cursor: unknown,
  ): Promise<{ items: ExplorerNode[]; cursor: unknown; hasMore: boolean }> {
    const { scope } = node;
    const session = this.requireSession(scope.dbPath);
    const context = { branch: scope.branch, space: scope.space };
    const base = { branch: scope.branch, space: scope.space, limit: this.pageSize };

    switch (node.primitive) {
      case "kv": {
        const response = await session.client.request(
          "kv.scan",
          { ...base, start: (cursor as WireBase64 | undefined) ?? null },
          context,
        );
        return {
          items: response.data.items.map((item) => ({
            type: "kv-entry",
            scope,
            key: item.key,
            label: keyLabel(item.key),
            preview: previewValue(item.value),
            version: item.version,
          })),
          cursor: response.data.cursor ?? null,
          hasMore: response.data.has_more,
        };
      }
      case "json": {
        const response = await session.client.request(
          "json.list",
          { ...base, cursor: (cursor as string | undefined) ?? null },
          context,
        );
        return {
          items: response.data.items.map((docId) => ({ type: "json-doc", scope, docId })),
          cursor: response.data.cursor ?? null,
          hasMore: response.data.has_more,
        };
      }
      case "events": {
        const response = await session.client.request(
          "event.list",
          { ...base, after_sequence: (cursor as number | undefined) ?? null },
          context,
        );
        return {
          items: response.data.items.map((item) => ({
            type: "event",
            scope,
            eventType: item.event.event_type,
            version: item.version,
            timestamp: item.timestamp,
          })),
          cursor: response.data.cursor ?? null,
          hasMore: response.data.has_more,
        };
      }
      case "vectors": {
        const response = await session.client.request(
          "vector.collection.list",
          { branch: scope.branch, space: scope.space },
          context,
        );
        return {
          items: response.data.items.map((info) => ({
            type: "vector-collection",
            scope,
            name: info.name,
            dimension: info.dimension,
            metric: String(info.metric),
            count: info.count,
          })),
          cursor: null,
          hasMore: false,
        };
      }
      case "graph": {
        const response = await session.client.request(
          "graph.list",
          { ...base, cursor: (cursor as string | undefined) ?? null },
          context,
        );
        return {
          items: response.data.items.map((name) => ({ type: "graph", scope, name: String(name) })),
          cursor: response.data.cursor ?? null,
          hasMore: response.data.has_more,
        };
      }
    }
  }
}
