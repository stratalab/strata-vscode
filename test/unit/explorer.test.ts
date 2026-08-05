/**
 * Explorer model (F1.1, F1.5) against the fake owner: level expansion,
 * pagination discipline (caps + cursors + explicit load-more), and previews.
 */
import { afterEach, describe, expect, it } from "vitest";
import { FakeServer } from "../harness/fakeServer";
import { DatabaseManager } from "../../src/attach/manager";
import { ManagedHostManager } from "../../src/attach/managedHost";
import { ExplorerModel, nodeKey, PAGE_SIZE_MAX } from "../../src/explorer/model";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

let server: FakeServer | null = null;
let manager: DatabaseManager | null = null;
let dbDir: string | null = null;

afterEach(async () => {
  if (manager) {
    // Sessions only; no managed hosts in these tests.
    for (const entry of manager.list()) void entry;
  }
  await server?.close();
  server = null;
  if (dbDir) fs.rmSync(dbDir, { recursive: true, force: true });
  dbDir = null;
});

const page = (items: unknown[], cursor: unknown = null, hasMore = false) => ({
  cursor,
  has_more: hasMore,
  items,
});

function route(requests: Array<Record<string, unknown>>, handlers: Record<string, (cmd: Record<string, unknown>) => unknown>) {
  return (envelope: { command: Record<string, unknown> }) => {
    requests.push(envelope.command);
    const handler = handlers[String(envelope.command.type)];
    if (!handler) return { error: { class: "not_found", code: "not_found.test.unrouted", message: String(envelope.command.type) } };
    return handler(envelope.command);
  };
}

async function build(handlers: Record<string, (cmd: Record<string, unknown>) => unknown>) {
  const requests: Array<Record<string, unknown>> = [];
  server = await FakeServer.start({ onRequest: route(requests, handlers) });

  // A real V1-layout dir whose socket is the fake server's.
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "svexp-"));
  fs.mkdirSync(path.join(dbDir, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(dbDir, "manifest", "current.object"), "x");
  fs.writeFileSync(path.join(dbDir, "strata.sock.path"), server.socketPath);

  manager = new DatabaseManager(
    {
      workspaceRoots: [],
      explicitDatabases: [dbDir],
      identity: { name: "strata-vscode", version: "0.0.0", pid: process.pid },
    },
    new ManagedHostManager(null, { loadHosts: () => [], saveHosts: () => {} }, true),
  );
  await manager.refresh();
  return { model: new ExplorerModel(manager), requests, dbPath: dbDir };
}

const B64_A = "YQ=="; // "a"

describe("explorer model", () => {
  it("expands database → branches → spaces → primitives with counts", async () => {
    const { model, dbPath } = await build({
      branch_list: () => ({ type: "branches", data: page([{ name: "default", status: "active", branch_id: "0", generation: 1, state_revision: 0 }]) }),
      space_list: () => ({ type: "space_list", data: page(["default", "cache"]) }),
      kv_count: () => ({ type: "uint", data: 41 }),
      json_count: () => ({ type: "uint", data: 7 }),
      event_count: () => ({ type: "uint", data: 99 }),
      vector_list_collections: () => ({ type: "vector_collection_list", data: page([{ name: "emb", dimension: 8, metric: "cosine", count: 3 }]) }),
    });

    const dbs = await model.children(null);
    expect(dbs).toHaveLength(1);
    expect(dbs[0]).toMatchObject({ type: "database", attached: true });

    const branches = await model.children(dbs[0]!);
    expect(branches).toEqual([{ type: "branch", dbPath, branch: "default", status: "active" }]);

    const spaces = await model.children(branches[0]!);
    expect(spaces.map((s) => (s as { space: string }).space)).toEqual(["default", "cache"]);

    const primitives = await model.children(spaces[0]!);
    expect(primitives.map((p) => [(p as { primitive: string }).primitive, (p as { count: number | null }).count])).toEqual([
      ["kv", 41],
      ["json", 7],
      ["events", 99],
      ["vectors", 1],
      ["graph", null],
    ]);
  });

  it("pages kv entries with capped limits, cursors, and explicit load-more (F1.5)", async () => {
    let scans = 0;
    const { model, requests } = await build({
      branch_list: () => ({ type: "branches", data: page([{ name: "default", status: "active", branch_id: "0", generation: 1, state_revision: 0 }]) }),
      space_list: () => ({ type: "space_list", data: page(["default"]) }),
      kv_count: () => ({ type: "uint", data: 150 }),
      json_count: () => ({ type: "uint", data: 0 }),
      event_count: () => ({ type: "uint", data: 0 }),
      vector_list_collections: () => ({ type: "vector_collection_list", data: page([]) }),
      kv_scan: () => {
        scans += 1;
        return scans === 1
          ? {
              type: "kv_scan_result",
              data: page(
                Array.from({ length: 100 }, (_, i) => ({ key: B64_A, value: B64_A, version: i, timestamp: 1 })),
                "bmV4dA==",
                true,
              ),
            }
          : {
              type: "kv_scan_result",
              data: page(
                Array.from({ length: 50 }, (_, i) => ({ key: B64_A, value: B64_A, version: 100 + i, timestamp: 1 })),
                null,
                false,
              ),
            };
      },
    });

    const dbs = await model.children(null);
    const branches = await model.children(dbs[0]!);
    const spaces = await model.children(branches[0]!);
    const primitives = await model.children(spaces[0]!);
    const kvNode = primitives[0]!;

    const first = await model.children(kvNode);
    expect(first).toHaveLength(101); // 100 entries + load-more
    expect(first[100]).toMatchObject({ type: "load-more", loaded: 100 });

    // Every scan carried a capped limit — no unbounded reads, ever.
    const scanRequests = requests.filter((r) => r.type === "kv_scan");
    expect(scanRequests).toHaveLength(1);
    expect(scanRequests[0]!.limit).toBe(100);

    await model.loadMore((first[100] as { parentKey: string }).parentKey);
    const all = await model.children(kvNode);
    expect(all).toHaveLength(150); // no load-more once has_more is false
    expect(requests.filter((r) => r.type === "kv_scan")[1]!.start).toBe("bmV4dA==");
  });

  it("refuses page sizes over the cap", async () => {
    const { model } = await build({});
    void model;
    expect(() => new ExplorerModel(manager!, PAGE_SIZE_MAX + 1)).toThrow(/cap/);
  });

  it("invalidates page state per database on refresh (F1.4)", async () => {
    let scans = 0;
    const { model, dbPath } = await build({
      branch_list: () => ({ type: "branches", data: page([{ name: "default", status: "active", branch_id: "0", generation: 1, state_revision: 0 }]) }),
      space_list: () => ({ type: "space_list", data: page(["default"]) }),
      kv_count: () => ({ type: "uint", data: 1 }),
      json_count: () => ({ type: "uint", data: 0 }),
      event_count: () => ({ type: "uint", data: 0 }),
      vector_list_collections: () => ({ type: "vector_collection_list", data: page([]) }),
      kv_scan: () => {
        scans += 1;
        return { type: "kv_scan_result", data: page([{ key: B64_A, value: B64_A, version: scans, timestamp: 1 }]) };
      },
    });

    const dbs = await model.children(null);
    const branches = await model.children(dbs[0]!);
    const spaces = await model.children(branches[0]!);
    const primitives = await model.children(spaces[0]!);
    const kvNode = primitives[0]!;

    await model.children(kvNode);
    await model.children(kvNode); // cached — no second scan
    expect(scans).toBe(1);

    model.invalidate(dbPath);
    await model.children(kvNode);
    expect(scans).toBe(2); // tick-driven invalidation re-reads

    expect(nodeKey(kvNode)).toContain(":kv");
  });
});
