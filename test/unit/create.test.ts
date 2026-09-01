/**
 * Local database creation: validate destinations before spawning, then use the
 * CLI's read-only-looking `info` open to create an empty durable layout.
 */
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createDurableDatabase, validateCreateTarget } from "../../src/attach/create";
import { classifyLayout } from "../../src/attach/discovery";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svcreate-"));
  dirs.push(dir);
  return dir;
}

function makeV1Db(parent: string, name: string): string {
  const db = path.join(parent, name);
  fs.mkdirSync(path.join(db, "manifest"), { recursive: true });
  fs.writeFileSync(path.join(db, "manifest", "current.object@"), "x");
  return db;
}

function stubBinary(body: string): string {
  const dir = scratch();
  const bin = path.join(dir, "strata");
  fs.writeFileSync(bin, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

describe("database creation targets", () => {
  it("allows a missing path under an existing parent and an empty directory", () => {
    const root = scratch();
    expect(validateCreateTarget(path.join(root, "new.strata"))).toMatchObject({ ok: true });

    const empty = path.join(root, "empty.strata");
    fs.mkdirSync(empty);
    expect(validateCreateTarget(empty)).toMatchObject({ ok: true });
  });

  it("refuses existing databases and non-empty non-database directories", () => {
    const root = scratch();
    const existing = makeV1Db(root, "existing.strata");
    expect(validateCreateTarget(existing)).toMatchObject({
      ok: false,
      error: { suggestedFix: "Use Connect Existing Database instead." },
    });

    const occupied = path.join(root, "occupied.strata");
    fs.mkdirSync(occupied);
    fs.writeFileSync(path.join(occupied, "notes.txt"), "x");
    expect(validateCreateTarget(occupied)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("not empty") },
    });
  });
});

describe("createDurableDatabase", () => {
  it("creates a durable V1 layout through strata info", async () => {
    const bin = stubBinary(`
db=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--db" ]; then db="$2"; shift 2; else shift; fi
done
mkdir -p "$db/manifest" "$db/snapshots" "$db/wal"
printf x > "$db/manifest/current.object@"
echo '{"type":"database_info","data":{"created":true}}'
`);
    const dbPath = path.join(scratch(), "new.strata");
    const result = await createDurableDatabase(bin, dbPath);
    expect(result).toMatchObject({ ok: true, dbPath });
    expect(classifyLayout(dbPath)).toBe("v1");
  });

  it("maps CLI JSON error envelopes", async () => {
    const bin = stubBinary(`
echo '{"error":{"class":"failed_precondition","code":"failed_precondition.executor.database_create","message":"cannot create here","suggested_fix":"pick another folder","retryable":false}}'
exit 1
`);
    const result = await createDurableDatabase(bin, path.join(scratch(), "new.strata"));
    expect(result).toMatchObject({
      ok: false,
      error: {
        class: "failed_precondition",
        code: "failed_precondition.executor.database_create",
        suggestedFix: "pick another folder",
      },
    });
  });
});
