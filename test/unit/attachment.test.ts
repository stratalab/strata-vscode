/**
 * The closed attachment-state set (F1.6): every state manufactured through
 * the probe seam, plus the layout-driven states from disk.
 */
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { determineState } from "../../src/attach/attachment";
import { HelloRefusedError, OwnerAtCapacityError, TransportError } from "../../src/wire/errors";
import { IDL_STAMPS } from "../../src/generated";
import type { ServerHello } from "../../src/wire/protocol";

const dirs: string[] = [];
function makeDb(layout: "v1" | "pre-v1" | "none"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svatt-"));
  dirs.push(dir);
  if (layout === "v1") {
    fs.mkdirSync(path.join(dir, "manifest"), { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest", "current.object"), "x");
  } else if (layout === "pre-v1") {
    fs.writeFileSync(path.join(dir, "strata.toml"), "");
  }
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const HELLO: ServerHello = {
  protocol: 2,
  release: "1.0.0",
  idl: {
    schema_version: IDL_STAMPS.schemaVersion,
    generator_version: IDL_STAMPS.generatorVersion,
  },
  granted_access: "read",
  capabilities: ["notify.version"],
  owner_pid: 4242,
};

function withSocket(db: string): string {
  fs.writeFileSync(path.join(db, "strata.sock"), "");
  return db;
}

describe("attachment states (F1.6)", () => {
  it("attachable when the socket answers, with skew fact", async () => {
    const db = withSocket(makeDb("v1"));
    const state = await determineState(db, async () => HELLO);
    expect(state).toMatchObject({ kind: "attachable", skewMatches: true });

    const skewed = await determineState(db, async () => ({
      ...HELLO,
      idl: { schema_version: "strata.idl.v2", generator_version: "x" },
    }));
    expect(skewed).toMatchObject({ kind: "attachable", skewMatches: false });
  });

  it("at-capacity on the typed refusal", async () => {
    const db = withSocket(makeDb("v1"));
    const state = await determineState(db, async () => {
      throw new OwnerAtCapacityError({ class: "resource_exhausted", code: "resource_exhausted.executor.ipc_connections" });
    });
    expect(state.kind).toBe("at-capacity");
  });

  it("version-mismatch on a refused hello", async () => {
    const db = withSocket(makeDb("v1"));
    const state = await determineState(db, async () => {
      throw new HelloRefusedError({
        class: "invalid_argument",
        code: "invalid_argument.executor.ipc_hello",
        message: "unsupported protocol revision 2; this owner speaks revision 3",
      });
    });
    expect(state).toMatchObject({ kind: "version-mismatch" });
    expect((state as { detail: string }).detail).toContain("revision 3");
  });

  it("falls back to pid facts on a stale socket: live pid → owned-unreachable", async () => {
    const db = withSocket(makeDb("v1"));
    fs.writeFileSync(path.join(db, "strata.pid"), String(process.pid));
    const state = await determineState(
      db,
      async () => {
        throw new TransportError("connection refused");
      },
      () => true,
    );
    expect(state).toMatchObject({ kind: "owned-unreachable", pid: process.pid });
  });

  it("stale socket and dead pid → unowned (start-host offer)", async () => {
    const db = withSocket(makeDb("v1"));
    fs.writeFileSync(path.join(db, "strata.pid"), "999999");
    const state = await determineState(
      db,
      async () => {
        throw new TransportError("connection refused");
      },
      () => false,
    );
    expect(state.kind).toBe("unowned");
  });

  it("no socket, no pid → unowned; live pid without socket → owned-unreachable", async () => {
    const db = makeDb("v1");
    expect((await determineState(db, failProbe)).kind).toBe("unowned");
    fs.writeFileSync(path.join(db, "strata.pid"), String(process.pid));
    const state = await determineState(db, failProbe, () => true);
    expect(state).toMatchObject({ kind: "owned-unreachable", pid: process.pid });
  });

  it("pre-V1 and non-database layouts are terminal teaching states", async () => {
    expect((await determineState(makeDb("pre-v1"), failProbe)).kind).toBe("pre-v1-layout");
    expect((await determineState(makeDb("none"), failProbe)).kind).toBe("not-a-database");
  });
});

async function failProbe(): Promise<ServerHello> {
  throw new Error("probe must not be called");
}
