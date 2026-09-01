/**
 * Database manager dynamic attachment paths: commands can add paths after the
 * extension has activated, without waiting for a configuration reload.
 */
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DatabaseManager } from "../../src/attach/manager";
import { ManagedHostManager, type ManagedHostRecord } from "../../src/attach/managedHost";
import { FakeServer } from "../harness/fakeServer";

const dirs: string[] = [];
const managers: DatabaseManager[] = [];
const servers: FakeServer[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.dispose();
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svmanager-"));
  dirs.push(dir);
  return dir;
}

function makeV1Db(parent: string, name = "db.strata"): string {
  const db = path.join(parent, name);
  fs.mkdirSync(path.join(db, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(db, "manifest", "current.object@"), "x");
  return db;
}

function hostManager(): ManagedHostManager {
  return new ManagedHostManager(
    null,
    {
      loadHosts: () => [],
      saveHosts: (_records: ManagedHostRecord[]) => {},
    },
    true,
  );
}

describe("DatabaseManager explicit database paths", () => {
  it("adds an explicit database path after initial refresh", async () => {
    const dbPath = makeV1Db(scratch());
    const manager = new DatabaseManager(
      {
        workspaceRoots: [],
        explicitDatabases: [],
        identity: { name: "strata-vscode", version: "0.0.0", pid: process.pid },
      },
      hostManager(),
    );
    managers.push(manager);
    await manager.refresh();
    expect(manager.list()).toHaveLength(0);

    const entry = await manager.addExplicitDatabase(dbPath);
    expect(entry).toMatchObject({ dbPath, state: { kind: "unowned" }, disconnected: false });
    expect(manager.explicitDatabases()).toEqual([dbPath]);
    expect(manager.list()).toHaveLength(1);
  });

  it("disconnects a live database without immediately reattaching on refresh", async () => {
    const server = await FakeServer.start();
    servers.push(server);
    const dbPath = makeV1Db(scratch());
    fs.writeFileSync(path.join(dbPath, "strata.sock.path"), server.socketPath);
    const manager = new DatabaseManager(
      {
        workspaceRoots: [],
        explicitDatabases: [dbPath],
        identity: { name: "strata-vscode", version: "0.0.0", pid: process.pid },
      },
      hostManager(),
    );
    managers.push(manager);

    await manager.refresh();
    expect(manager.session(dbPath)).toBeDefined();
    expect(manager.list()[0]).toMatchObject({ state: { kind: "attachable" }, disconnected: false });

    const disconnected = await manager.disconnectDatabase(dbPath);
    expect(disconnected).toMatchObject({ state: { kind: "attachable" }, disconnected: true });
    expect(manager.session(dbPath)).toBeUndefined();

    await manager.refreshOne(dbPath);
    expect(manager.list()[0]).toMatchObject({ state: { kind: "attachable" }, disconnected: true });
    expect(manager.session(dbPath)).toBeUndefined();

    const reconnected = await manager.connectDatabase(dbPath);
    expect(reconnected).toMatchObject({ state: { kind: "attachable" }, disconnected: false });
    expect(manager.session(dbPath)).toBeDefined();
  });

  it("removes and ignores a workspace-discovered database until the ignore list changes", async () => {
    const root = scratch();
    const dbPath = makeV1Db(root, "workspace-db");
    const manager = new DatabaseManager(
      {
        workspaceRoots: [root],
        explicitDatabases: [],
        identity: { name: "strata-vscode", version: "0.0.0", pid: process.pid },
      },
      hostManager(),
    );
    managers.push(manager);

    await manager.refresh();
    expect(manager.list().map((entry) => entry.dbPath)).toEqual([dbPath]);

    await manager.removeDatabase(dbPath);
    expect(manager.list()).toHaveLength(0);
    expect(manager.ignoredDatabasePaths()).toEqual([dbPath]);

    await manager.refresh();
    expect(manager.list()).toHaveLength(0);

    manager.setIgnoredDatabases([]);
    await manager.refresh();
    expect(manager.list().map((entry) => entry.dbPath)).toEqual([dbPath]);
  });
});
