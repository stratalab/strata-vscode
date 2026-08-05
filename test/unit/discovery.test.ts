/**
 * Discovery and socket resolution (AR-2.2, AR-3.4): layout classification on
 * fixture directories and the executor's socket-resolution rules.
 */
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { classifyLayout, findDatabases } from "../../src/attach/discovery";
import { readOwnerPid, resolveSocketPath, isPidAlive } from "../../src/attach/socketDiscovery";

const roots: string[] = [];
function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svdisc-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeV1Db(parent: string, name: string): string {
  const db = path.join(parent, name);
  fs.mkdirSync(path.join(db, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(db, "manifest", "current.object"), "x");
  return db;
}

describe("layout classification (F1.6 inputs)", () => {
  it("recognizes the V1 layout by manifest/current", () => {
    const db = makeV1Db(scratch(), "db");
    expect(classifyLayout(db)).toBe("v1");
  });

  it("recognizes the pre-V1 marker files", () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, "strata.toml"), "");
    expect(classifyLayout(dir)).toBe("pre-v1");
    const dir2 = scratch();
    fs.writeFileSync(path.join(dir2, "MANIFEST"), "");
    expect(classifyLayout(dir2)).toBe("pre-v1");
  });

  it("classifies everything else as not-a-database", () => {
    expect(classifyLayout(scratch())).toBe("not-a-database");
    // A manifest dir with no current pointer is not a database…
    const partial = scratch();
    fs.mkdirSync(path.join(partial, "manifest"));
    expect(classifyLayout(partial)).toBe("not-a-database");
    // …and an unsuffixed current pointer still counts (backend-agnostic).
    fs.writeFileSync(path.join(partial, "manifest", "current"), "x");
    expect(classifyLayout(partial)).toBe("v1");
  });

  it("does not mistake the manifest DIRECTORY for the pre-V1 MANIFEST file", () => {
    // Case-insensitive filesystems (macOS default) resolve "MANIFEST" to the
    // V1 "manifest" directory; only a real file may classify as pre-V1.
    const db = makeV1Db(scratch(), "db");
    expect(classifyLayout(db)).toBe("v1");
  });
});

describe("workspace discovery (AR-3.4)", () => {
  it("finds nested databases, honors explicit paths, skips dependency dirs", () => {
    const root = scratch();
    const nested = makeV1Db(path.join(root, "apps", "agent"), "memory.strata");
    fs.mkdirSync(path.join(root, "apps", "agent"), { recursive: true });
    const hidden = makeV1Db(path.join(root, "node_modules", "pkg"), "db");
    const outside = makeV1Db(scratch(), "external");

    const found = findDatabases([root], [outside]);
    expect(found).toContain(path.resolve(nested));
    expect(found).toContain(path.resolve(outside));
    expect(found).not.toContain(path.resolve(hidden));
  });
});

describe("socket discovery (AR-2.2)", () => {
  it("prefers <db>/strata.sock, then the pointer file, existence-checked", () => {
    const db = makeV1Db(scratch(), "db");
    expect(resolveSocketPath(db)).toBeNull();

    // Pointer to a real target wins when no direct socket exists.
    const target = path.join(scratch(), "elsewhere.sock");
    fs.writeFileSync(target, "");
    fs.writeFileSync(path.join(db, "strata.sock.path"), `${target}\n`);
    expect(resolveSocketPath(db)).toBe(target);

    // A stale pointer (target gone) resolves to nothing.
    fs.rmSync(target);
    expect(resolveSocketPath(db)).toBeNull();

    // The direct socket file takes precedence over everything.
    fs.writeFileSync(path.join(db, "strata.sock"), "");
    expect(resolveSocketPath(db)).toBe(path.join(db, "strata.sock"));
  });

  it("reads the owner pid and checks liveness", () => {
    const db = makeV1Db(scratch(), "db");
    expect(readOwnerPid(db)).toBeNull();
    fs.writeFileSync(path.join(db, "strata.pid"), `${process.pid}\n`);
    expect(readOwnerPid(db)).toBe(process.pid);
    expect(isPidAlive(process.pid)).toBe(true);
    fs.writeFileSync(path.join(db, "strata.pid"), "not-a-pid");
    expect(readOwnerPid(db)).toBeNull();
  });
});
