/**
 * M2 lifecycle scenarios against a real owner (N7): attach-first state
 * probing, managed-host start/adopt/stop (AR-3.2, AR-8.1), owner-death state
 * transitions (AR-8.2), tick-driven model refresh end-to-end (F1.4), and the
 * N1 perf smoke.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveStrataBin } from "../harness/strataBin";
import { StartedHost, TestDb } from "../harness/host";
import { determineState } from "../../src/attach/attachment";
import { ManagedHostManager, type ManagedHostRecord } from "../../src/attach/managedHost";
import { DatabaseManager } from "../../src/attach/manager";
import { ExplorerModel } from "../../src/explorer/model";
import { isPidAlive } from "../../src/attach/socketDiscovery";

const bin = resolveStrataBin();
const identity = { name: "strata-vscode", version: "0.0.0", pid: process.pid };

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch {
      // best-effort teardown
    }
  }
});

function memoryPersistence(initial: ManagedHostRecord[] = []) {
  const store = { records: initial };
  return {
    loadHosts: () => [...store.records],
    saveHosts: (records: ManagedHostRecord[]) => {
      store.records = [...records];
    },
    store,
  };
}

describe.skipIf(!bin)("attach & lifecycle (real strata owner)", () => {
  it("walks the state machine: unowned → hosted → attachable → killed → unowned", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());
    db.seedKv([["k", "v"]]);

    expect((await determineState(db.dbPath)).kind).toBe("unowned");

    const host = await StartedHost.start(db, bin!);
    const live = await determineState(db.dbPath);
    expect(live).toMatchObject({ kind: "attachable", skewMatches: true });

    host.kill();
    await host.waitExit(5_000);
    // The dead owner may leave a stale socket file; the prober must see through it.
    const after = await determineState(db.dbPath);
    expect(["unowned", "owned-unreachable"]).toContain(after.kind);
    expect(after.kind).toBe("unowned");
  });

  it("manages a host: start, re-adopt from a fresh manager, stop (AR-3.2, AR-8.1)", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());
    db.seedKv([["k", "v"]]);

    const persistence = memoryPersistence();
    const first = new ManagedHostManager(bin!, persistence, true);
    const record = await first.startHost(db.dbPath);
    cleanups.push(() => first.stopAll());
    expect(record.pid).toBeGreaterThan(0);
    expect(isPidAlive(record.pid)).toBe(true);
    expect((await determineState(db.dbPath)).kind).toBe("attachable");

    // A "reload": a new manager over the same persistence re-adopts, not respawns.
    const second = new ManagedHostManager(bin!, persistence, true);
    const adopted = second.adoptOrForget();
    expect(adopted).toHaveLength(1);
    expect(adopted[0]!.pid).toBe(record.pid);
    expect(second.isManaged(db.dbPath)).toBe(true);

    // AR-8.4: deactivation stops it; the pid dies and the record clears.
    await second.stopHost(db.dbPath);
    await new Promise((r) => setTimeout(r, 500));
    expect(isPidAlive(record.pid)).toBe(false);
    expect(second.isManaged(db.dbPath)).toBe(false);
    expect((await determineState(db.dbPath)).kind).toBe("unowned");
  });

  it("refuses to spawn untrusted, and forgets dead records (AR-7.5, AR-8.1)", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());

    const untrusted = new ManagedHostManager(bin!, memoryPersistence(), false);
    await expect(untrusted.startHost(db.dbPath)).rejects.toThrow(/untrusted workspace/);

    const stale = memoryPersistence([
      { dbPath: db.dbPath, pid: 999_999, socketPath: "/nowhere", startedAt: "then" },
    ]);
    const manager = new ManagedHostManager(bin!, stale, true, () => false);
    expect(manager.adoptOrForget()).toHaveLength(0);
    expect(stale.store.records).toHaveLength(0);
  });

  it("drives the explorer model live: a cross-process write refreshes the tree (F1.4)", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());
    db.seedKv([["first", "1"]]);
    const host = await StartedHost.start(db, bin!);
    cleanups.push(() => host.stop(bin!));

    const manager = new DatabaseManager(
      { workspaceRoots: [], explicitDatabases: [db.dbPath], identity },
      new ManagedHostManager(bin!, memoryPersistence(), true),
    );
    cleanups.push(() => manager.dispose());
    const refreshes: Array<string | undefined> = [];
    manager.onDidChange((dbPath) => refreshes.push(dbPath));
    await manager.refresh();

    const model = new ExplorerModel(manager);
    const dbs = await model.children(null);
    expect(dbs[0]).toMatchObject({ type: "database", attached: true });
    const branches = await model.children(dbs[0]!);
    const spaces = await model.children(branches[0]!);
    const primitives = await model.children(spaces[0]!);
    expect(primitives[0]).toMatchObject({ primitive: "kv", count: 1 });

    // Another process writes; the tick → debounce → change event pipeline
    // must fire without any polling.
    const before = refreshes.length;
    db.seedKv([["second", "2"]]);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no tick-driven refresh within 3s")), 3_000);
      const check = setInterval(() => {
        if (refreshes.length > before) {
          clearTimeout(timer);
          clearInterval(check);
          resolve();
        }
      }, 25);
    });

    model.invalidate(db.dbPath);
    const primitivesAfter = await model.children(
      (await model.children((await model.children((await model.children(null))[0]!))[0]!))[0]!,
    );
    expect(primitivesAfter[0]).toMatchObject({ primitive: "kv", count: 2 });
  });

  it("meets the N1 one-page budget against a local owner (perf smoke)", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());
    db.seedKv(Array.from({ length: 120 }, (_, i) => [`key-${String(i).padStart(3, "0")}`, `value-${i}`] as [string, string]));
    const host = await StartedHost.start(db, bin!);
    cleanups.push(() => host.stop(bin!));

    const manager = new DatabaseManager(
      { workspaceRoots: [], explicitDatabases: [db.dbPath], identity },
      new ManagedHostManager(bin!, memoryPersistence(), true),
    );
    cleanups.push(() => manager.dispose());
    await manager.refresh();
    const session = manager.session(db.dbPath)!;

    // Warm the lane, then time one page (soft target 150 ms, hard fail 500 ms
    // to stay flake-tolerant in CI — the soft number is reported).
    await session.client.request("kv.count", { space: "default" }, { branch: "default", space: "default" });
    const start = performance.now();
    const pageResult = await session.client.request(
      "kv.scan",
      { limit: 100, space: "default" },
      { branch: "default", space: "default" },
    );
    const elapsed = performance.now() - start;
    expect(pageResult.data.items).toHaveLength(100);
    console.log(`N1 perf smoke: one kv page in ${elapsed.toFixed(1)} ms (soft target 150)`);
    expect(elapsed).toBeLessThan(500);
  });
});
