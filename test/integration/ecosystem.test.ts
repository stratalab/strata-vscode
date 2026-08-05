/**
 * M5 against the real binary: clone error mapping end-to-end (unreachable
 * hub → typed transport refusal, fast) and the §3.2 attachability of a
 * `strata mcp serve` owner — the F6.5 observability premise.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolveStrataBin } from "../harness/strataBin";
import { TestDb } from "../harness/host";
import { runClone } from "../../src/hub/clone";
import { resolveSocketPath } from "../../src/attach/socketDiscovery";
import { InteractiveClient } from "../../src/wire/client";

const bin = resolveStrataBin();
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch {
      // best-effort
    }
  }
});

describe.skipIf(!bin)("ecosystem (real strata binary)", () => {
  it("maps real clone failures by code: slug validation, then transport (F5.3)", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());

    // Slug validation is local and fires before any network.
    const badSlug = await runClone(bin!, {
      dataset: "no/such-dataset",
      dest: `${db.root}/cloned-a`,
      hubUrl: "http://127.0.0.1:9",
    });
    expect(badSlug.ok).toBe(false);
    if (!badSlug.ok) expect(badSlug.error.code).toBe("invalid_argument.executor.hub_dataset");

    // A valid slug against an unreachable hub is the retryable transport case.
    const unreachable = await runClone(bin!, {
      dataset: "test-dataset",
      dest: `${db.root}/cloned-b`,
      hubUrl: "http://127.0.0.1:9",
    });
    expect(unreachable.ok).toBe(false);
    if (!unreachable.ok) {
      expect(unreachable.error.code).toBe("unavailable.executor.hub_transport");
      expect(unreachable.error.retryable).toBe(true);
      expect(unreachable.error.suggestedFix).toBeTruthy();
    }
  });

  it("attaches to a `strata mcp serve` owner — an agent session is observable (§3.2, F6.5)", async () => {
    const db = TestDb.create(bin!);
    cleanups.push(() => db.cleanup());
    db.seedKv([["agent-memory", "hello"]]);

    // The exact process an MCP-registered agent would spawn.
    const server: ChildProcess = spawn(bin!, ["--db", db.dbPath, "mcp", "serve"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    cleanups.push(() => {
      server.kill("SIGKILL");
    });

    // mcp serve hosts the IPC socket as a side effect of opening (IpcMode::Host).
    const socketPath = await waitFor(() => resolveSocketPath(db.dbPath), 10_000);
    expect(socketPath).not.toBeNull();

    const client = await InteractiveClient.connect(socketPath!);
    cleanups.push(() => client.close());
    const status = await client.request("admin.ipc_status", {}, { branch: "default" });
    expect(status.data.hosting).toBe(true);
    expect(status.data.is_owner).toBe(true);
    // Our observer session shows up in the client list (AR-3.5) — the same
    // surface where the user watches their agent's session appear (F6.5).
    expect(status.data.clients?.some((c) => c.name === "strata-vscode")).toBe(true);

    const got = await client.request(
      "kv.get",
      { key: Buffer.from("agent-memory").toString("base64") as never },
      { branch: "default" },
    );
    expect(got.data.found).toBe(true);
  });
});

async function waitFor<T>(probe: () => T | null, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value !== null) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}
