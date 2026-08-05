/**
 * Time travel (F2): view context semantics, timestamp parsing, scrub-aware
 * model reads against the fake owner, timelines, and the retention teaching
 * state (F2.5).
 */
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FakeServer } from "../harness/fakeServer";
import { DatabaseManager } from "../../src/attach/manager";
import { ManagedHostManager } from "../../src/attach/managedHost";
import { ExplorerModel } from "../../src/explorer/model";
import { kvTimeline } from "../../src/explorer/history";
import { ViewContextStore } from "../../src/state/viewContext";
import { parseTimestampMicros } from "../../src/explorer/time";
import { encodeUtf8 } from "../../src/wire/bytes";
import { InteractiveClient } from "../../src/wire/client";

let server: FakeServer | null = null;
let dbDir: string | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
  if (dbDir) fs.rmSync(dbDir, { recursive: true, force: true });
  dbDir = null;
});

function contextStore() {
  let saved: Record<string, string> = {};
  return new ViewContextStore({
    loadBranches: () => saved,
    saveBranches: (map) => (saved = map),
  });
}

describe("view context (F2.1, AR-8.3)", () => {
  it("persists branch selection; the scrubber is session-only", () => {
    let saved: Record<string, string> = {};
    const store = new ViewContextStore({
      loadBranches: () => saved,
      saveBranches: (map) => (saved = map),
    });
    store.setBranch("/db", "feature");
    expect(saved["/db"]).toBe("feature"); // persisted

    store.setAsOf("/db", 123_000_000);
    expect(store.isScrubbed("/db")).toBe(true);
    // A "reload" sees the branch but never the scrub position.
    const reloaded = new ViewContextStore({ loadBranches: () => saved, saveBranches: () => {} });
    expect(reloaded.branchFor("/db")).toBe("feature");
    expect(reloaded.isScrubbed("/db")).toBe(false);
  });
});

describe("timestamp parsing", () => {
  it("accepts ISO and unix seconds/millis/micros, normalizing to micros", () => {
    expect(parseTimestampMicros("2026-08-05T12:00:00Z")).toBe(Date.parse("2026-08-05T12:00:00Z") * 1_000);
    expect(parseTimestampMicros("1754400000")).toBe(1_754_400_000_000_000);
    expect(parseTimestampMicros("1754400000000")).toBe(1_754_400_000_000_000);
    expect(parseTimestampMicros("1754400000000000")).toBe(1_754_400_000_000_000);
    expect(parseTimestampMicros("garbage")).toBeNull();
    expect(parseTimestampMicros("")).toBeNull();
  });
});

async function buildScrubbedModel(handlers: Record<string, (cmd: Record<string, unknown>) => unknown>) {
  const requests: Array<Record<string, unknown>> = [];
  server = await FakeServer.start({
    onRequest: (envelope) => {
      requests.push(envelope.command);
      const handler = handlers[String(envelope.command.type)];
      return handler
        ? handler(envelope.command)
        : { error: { class: "not_found", code: "not_found.test.unrouted" } };
    },
  });
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "svtt-"));
  fs.mkdirSync(path.join(dbDir, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(dbDir, "manifest", "current.object"), "x");
  fs.writeFileSync(path.join(dbDir, "strata.sock.path"), server.socketPath);
  const manager = new DatabaseManager(
    { workspaceRoots: [], explicitDatabases: [dbDir], identity: { name: "t", pid: process.pid } },
    new ManagedHostManager(null, { loadHosts: () => [], saveHosts: () => {} }, true),
  );
  await manager.refresh();
  const viewContext = contextStore();
  return { manager, viewContext, model: new ExplorerModel(manager, viewContext), requests, dbPath: dbDir };
}

const page = (items: unknown[]) => ({ cursor: null, has_more: false, items });

describe("scrub-aware reads (F2.2)", () => {
  it("switches kv to as_of-capable kv.list and stamps as_of on other reads", async () => {
    const { viewContext, model, requests, dbPath } = await buildScrubbedModel({
      branch_list: () => ({ type: "branches", data: page([{ name: "default", status: "active", branch_id: "0", generation: 1, state_revision: 0 }]) }),
      space_list: () => ({ type: "space_list", data: page(["default"]) }),
      kv_count: () => ({ type: "uint", data: 1 }),
      json_count: () => ({ type: "uint", data: 0 }),
      event_count: () => ({ type: "uint", data: 0 }),
      vector_list_collections: () => ({ type: "vector_collection_list", data: page([]) }),
      kv_list: () => ({ type: "keys_page", data: page([encodeUtf8("old-key")]) }),
      json_list: () => ({ type: "json_list_result", data: page([]) }),
    });
    viewContext.setAsOf(dbPath, 999_000_000);

    const dbs = await model.children(null);
    expect((dbs[0] as { scrubbedTo: string | null }).scrubbedTo).not.toBeNull();
    const branches = await model.children(dbs[0]!);
    const spaces = await model.children(branches[0]!);
    const primitives = await model.children(spaces[0]!);
    const kvEntries = await model.children(primitives[0]!);
    expect(kvEntries[0]).toMatchObject({ type: "kv-entry", version: null, label: "old-key" });

    // kv used kv_list (not kv_scan), carrying as_of; json.list carried it too.
    expect(requests.some((r) => r.type === "kv_scan")).toBe(false);
    const kvList = requests.find((r) => r.type === "kv_list")!;
    expect(kvList.as_of).toBe(999_000_000);
    await model.children(primitives[1]!);
    const jsonList = requests.find((r) => r.type === "json_list")!;
    expect(jsonList.as_of).toBe(999_000_000);
    // Counts that take as_of carried it as well.
    expect(requests.find((r) => r.type === "kv_count")!.as_of).toBe(999_000_000);
  });

  it("renders history_unavailable as a retention teaching node (F2.5)", async () => {
    const { viewContext, model, dbPath } = await buildScrubbedModel({
      branch_list: () => ({ type: "branches", data: page([{ name: "default", status: "active", branch_id: "0", generation: 1, state_revision: 0 }]) }),
      space_list: () => ({ type: "space_list", data: page(["default"]) }),
      kv_count: () => ({
        error: {
          class: "history_unavailable",
          code: "history_unavailable.engine.persistence_history",
          message: "history is not retained at this version",
        },
      }),
    });
    viewContext.setAsOf(dbPath, 1);
    const dbs = await model.children(null);
    const branches = await model.children(dbs[0]!);
    const spaces = await model.children(branches[0]!);
    const nodes = await model.children(spaces[0]!);
    expect(nodes).toEqual([
      expect.objectContaining({ type: "message", teaching: "retention" }),
    ]);
  });

  it("suspends tick-driven refresh while scrubbed (F2.2)", async () => {
    const { manager, viewContext, dbPath } = await buildScrubbedModel({});
    const changes: Array<string | undefined> = [];
    manager.onDidChange((p) => changes.push(p));
    manager.setTickGate((p) => !viewContext.isScrubbed(p));

    viewContext.setAsOf(dbPath, 1);
    const before = changes.length;
    server!.notify(812); // a tick arrives while scrubbed
    await new Promise((r) => setTimeout(r, 400)); // > debounce window
    expect(changes.length).toBe(before); // suppressed

    viewContext.setAsOf(dbPath, null);
    server!.notify(813);
    await new Promise((r) => setTimeout(r, 400));
    expect(changes.length).toBeGreaterThan(before); // live again
  });
});

describe("timelines (F2.3)", () => {
  it("maps kv.history and treats history_unavailable as a state", async () => {
    let unavailable = false;
    server = await FakeServer.start({
      onRequest: () =>
        unavailable
          ? {
              error: {
                class: "history_unavailable",
                code: "history_unavailable.engine.persistence_history",
                message: "not retained",
              },
            }
          : {
              type: "version_history",
              data: {
                items: [
                  { version: 3, timestamp: 3_000_000, tombstone: false, value: encodeUtf8("v3") },
                  { version: 1, timestamp: 1_000_000, tombstone: true, value: null },
                ],
              },
            },
    });
    const client = await InteractiveClient.connect(server.socketPath);
    const scope = { dbPath: "/db", branch: "default", space: "default" };

    const timeline = await kvTimeline(client, scope, encodeUtf8("k"));
    expect(timeline).toMatchObject({ kind: "timeline" });
    if (timeline.kind === "timeline") {
      expect(timeline.entries).toHaveLength(2);
      expect(timeline.entries[0]).toMatchObject({ version: 3, preview: "v3" });
      expect(timeline.entries[1]).toMatchObject({ version: 1, tombstone: true, preview: null });
    }

    unavailable = true;
    const gone = await kvTimeline(client, scope, encodeUtf8("k"));
    expect(gone).toMatchObject({ kind: "unavailable", reason: "not retained" });
    client.close();
  });
});
