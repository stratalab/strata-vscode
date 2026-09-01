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

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svmanager-"));
  dirs.push(dir);
  return dir;
}

function makeV1Db(parent: string): string {
  const db = path.join(parent, "db.strata");
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
    await manager.refresh();
    expect(manager.list()).toHaveLength(0);

    const entry = await manager.addExplicitDatabase(dbPath);
    expect(entry).toMatchObject({ dbPath, state: { kind: "unowned" } });
    expect(manager.explicitDatabases()).toEqual([dbPath]);
    expect(manager.list()).toHaveLength(1);

    await manager.dispose();
  });
});
