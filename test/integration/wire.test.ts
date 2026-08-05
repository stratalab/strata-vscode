/**
 * Cross-process wire scenarios (N7) against a real `strata start` owner on
 * durable temp databases — the §4.2 scenario ledger, E2/E3-owned rows:
 * hello/skew, the read gate both ways, tick-driven refresh, deadline shed,
 * capacity refusal, and owner-death recovery.
 *
 * Self-skips (loudly) when no strata binary is resolvable — CI provides one
 * built from the pinned rev.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveStrataBin } from "../harness/strataBin";
import { StartedHost, TestDb } from "../harness/host";
import { RawSession } from "../harness/rawSession";
import { TranscriptRecorder } from "../harness/transcript";
import { InteractiveClient } from "../../src/wire/client";
import { SubscriberSession, ReconnectingSubscriber } from "../../src/wire/subscriber";
import {
  DeadlineShedError,
  OwnerAtCapacityError,
  TransportError,
} from "../../src/wire/errors";
import { encodeUtf8 } from "../../src/wire/bytes";
import { IDL_STAMPS } from "../../src/generated";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const bin = resolveStrataBin();
if (!bin) {
   
  console.warn("integration: no strata binary (STRATA_BIN / ../strata-core build / PATH) — suite skipped");
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch {
      // teardown best-effort
    }
  }
});

async function startSeededHost(): Promise<{ db: TestDb; host: StartedHost }> {
  const db = TestDb.create(bin!);
  db.seedKv([["hi", "there"]]);
  const host = await StartedHost.start(db, bin!);
  cleanups.push(() => db.cleanup());
  cleanups.push(() => host.stop(bin!));
  return { db, host };
}

describe.skipIf(!bin)("cross-process wire (real strata owner)", () => {
  beforeAll(() => {
     
    console.log(`integration: using strata binary at ${bin}`);
  });

  it("attaches with a matching hello: stamps, read access, owner pid", async () => {
    const { host } = await startSeededHost();
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());

    expect(client.hello.protocol).toBe(2);
    expect(client.hello.granted_access).toBe("read");
    expect(client.hello.owner_pid).toBeGreaterThan(0);
    expect(client.skew.matches).toBe(true); // binary built from the pinned rev
    expect(client.hello.idl.schema_version).toBe(IDL_STAMPS.schemaVersion);

    const got = await client.request("kv.get", { key: encodeUtf8("hi") }, { branch: "default" });
    expect(got.data.found).toBe(true);
    expect(got.data.value?.value).toBe(encodeUtf8("there"));
  });

  it("refuses an unsupported protocol revision by contract (AR-2.3)", async () => {
    const { host } = await startSeededHost();
    const session = await RawSession.connect(host.socketPath);
    cleanups.push(() => session.close());
    // The spread overrides the default protocol 2 with an unsupported 999.
    const reply = (await session.hello("read", { protocol: 999 })) as {
      error?: { code?: string; class?: string };
    };
    expect(reply.error?.code).toBe("invalid_argument.executor.ipc_hello");
    expect(reply.error?.class).toBe("invalid_argument");
  });

  it("enforces the read gate at the owner and pre-empts it in the client (AR-4)", async () => {
    const { host } = await startSeededHost();

    // Raw read session sends a write the extension's gate would never send:
    const rawRead = await RawSession.connect(host.socketPath);
    cleanups.push(() => rawRead.close());
    await rawRead.hello("read");
    rawRead.send({
      id: 1,
      command: { type: "kv_put", key: encodeUtf8("hi"), value: encodeUtf8("mutated") },
    });
    const refusal = (await rawRead.recv()) as {
      id: number;
      payload: { error?: { code: string; commit_outcome?: string } };
    };
    expect(refusal.id).toBe(1);
    expect(refusal.payload.error?.code).toBe("access_denied.executor.read_only_session");

    // A write session CAN write — the harness seeding path (asymmetry proof):
    const rawWrite = await RawSession.connect(host.socketPath);
    cleanups.push(() => rawWrite.close());
    await rawWrite.hello("read_write");
    rawWrite.send({
      id: 1,
      command: { type: "kv_put", key: encodeUtf8("other"), value: encodeUtf8("ok") },
    });
    const accepted = (await rawWrite.recv()) as { payload: { error?: unknown } };
    expect(accepted.payload.error).toBeUndefined();

    // And the seeded value survived the refused write:
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());
    const got = await client.request("kv.get", { key: encodeUtf8("hi") }, { branch: "default" });
    expect(got.data.value?.value).toBe(encodeUtf8("there"));
  });

  it("delivers version ticks for cross-process writes (AR-5)", async () => {
    const { db, host } = await startSeededHost();
    const subscriber = await SubscriberSession.connect(host.socketPath);
    cleanups.push(() => subscriber.close());

    const ticks: number[] = [];
    subscriber.onTick((version) => ticks.push(version));

    // Separate one-shot processes write, brokered through the owner.
    db.seedKv([["tick-1", "a"]]);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no tick within 3s")), 3_000);
      const poll = setInterval(() => {
        if (ticks.length > 0) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve(null);
        }
      }, 25);
    });

    const before = ticks[ticks.length - 1]!;
    db.seedKv([
      ["tick-2", "b"],
      ["tick-3", "c"],
    ]);
    await new Promise((r) => setTimeout(r, 1_000));
    const after = ticks[ticks.length - 1]!;
    expect(after).toBeGreaterThan(before); // the watermark advanced; coalescing is allowed
  });

  it("sheds an expired deadline before execution (AR-2.5)", async () => {
    const { host } = await startSeededHost();
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());

    const shed = await client
      .request("kv.get", { key: encodeUtf8("hi") }, { branch: "default", deadlineMs: 0 })
      .catch((e: unknown) => e);
    expect(shed).toBeInstanceOf(DeadlineShedError);
    expect((shed as DeadlineShedError).commitOutcome).toBe("not_started");

    // The connection is intact; the next request serves normally.
    const got = await client.request("kv.get", { key: encodeUtf8("hi") }, { branch: "default" });
    expect(got.data.found).toBe(true);
  });

  it("refuses connections past the owner cap with a typed frame (AR-2.7)", async () => {
    const { host } = await startSeededHost();
    const held: RawSession[] = [];
    cleanups.push(() => held.forEach((s) => s.close()));

    for (let i = 0; i < 128; i++) {
      const session = await RawSession.connect(host.socketPath);
      held.push(session);
      await session.hello("read");
    }

    const refused = await InteractiveClient.connect(host.socketPath).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(OwnerAtCapacityError);
  }, 60_000);

  it("recovers from owner death: transport error, reattach, re-read trigger (AR-8.2)", async () => {
    const { db, host } = await startSeededHost();
    const client = await InteractiveClient.connect(host.socketPath);

    const socketPath = host.socketPath;
    const connectedCount = { value: 0 };
    const subscriber = new ReconnectingSubscriber(() => SubscriberSession.connect(socketPath));
    subscriber.onConnected(() => (connectedCount.value += 1));
    subscriber.start();
    cleanups.push(() => subscriber.stop());

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("subscriber never attached")), 5_000);
      subscriber.onStateChange((state) => {
        if (state === "connected") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    expect(connectedCount.value).toBe(1);

    // The owner dies without ceremony.
    host.kill();
    await host.waitExit(5_000);

    const failure = await client
      .request("kv.get", { key: encodeUtf8("hi") }, { branch: "default" })
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TransportError);
    client.close();

    // A new owner takes over the same database; the subscriber reattaches by
    // itself and fires the re-read trigger again (AR-5.3).
    const revived = await StartedHost.start(db, bin!);
    cleanups.push(() => revived.stop(bin!));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("subscriber never reattached")), 15_000);
      const poll = setInterval(() => {
        if (connectedCount.value >= 2) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 50);
    });

    const reattached = await InteractiveClient.connect(revived.socketPath);
    cleanups.push(() => reattached.close());
    const got = await reattached.request("kv.get", { key: encodeUtf8("hi") }, { branch: "default" });
    expect(got.data.found).toBe(true); // durable data survived the crash
  }, 30_000);

  it("records a replayable transcript of a live exchange (E3)", async () => {
    const { host } = await startSeededHost();
    const recorder = new TranscriptRecorder();
    const session = await RawSession.connect(host.socketPath, recorder);
    cleanups.push(() => session.close());

    await session.hello("read", {
      idl: {
        schema_version: IDL_STAMPS.schemaVersion,
        generator_version: IDL_STAMPS.generatorVersion,
      },
      client: { name: "strata-vscode", version: "0.1.0", pid: process.pid },
      capabilities: ["notify.version"],
    });
    session.send({ id: 1, deadline_ms: 2000, branch: "default", command: { type: "kv_get", key: encodeUtf8("hi") } });
    await session.recv();

    expect(recorder.entries.map((e) => e.direction)).toEqual(["send", "recv", "send", "recv"]);
    const helloReply = recorder.entries[1]!.frame as { type: string };
    expect(helloReply.type).toBe("ipc_hello");

    // Transcripts carry pids and versions, so live recordings stay out of the
    // repo; curated ones get committed when the first UI consumer lands (E5).
    const saved = path.join(os.tmpdir(), `strata-transcript-${process.pid}.json`);
    recorder.saveSync(saved);
    const replayed = TranscriptRecorder.loadSync(saved);
    expect(replayed).toEqual(recorder.entries);
    fs.rmSync(saved, { force: true });
  });
});
