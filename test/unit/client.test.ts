/**
 * Interactive client behavior (AR-2.4/2.5/2.6, AR-4.2/4.3, N3) against the
 * fake owner: single in-flight, correlation, deadlines by class, the write
 * gate, and error mapping by code.
 */
import { afterEach, describe, expect, it } from "vitest";
import { FakeServer } from "../harness/fakeServer";
import { InteractiveClient } from "../../src/wire/client";
import {
  CommandFailedError,
  DeadlineShedError,
  ProtocolViolationError,
  ReadOnlySessionViolationError,
  RequestTimeoutError,
  TransportError,
  WriteCommandBlockedError,
  CODES,
} from "../../src/wire/errors";
import { encodeUtf8 } from "../../src/wire/bytes";

let server: FakeServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const KV_GET_OK = {
  type: "kv_versioned_value",
  data: { found: true, value: { value: "dGhlcmU=", version: 3, timestamp: 1 } },
};

describe("interactive client", () => {
  it("sends a typed request with explicit branch and echoes the typed response", async () => {
    server = await FakeServer.start({ onRequest: () => KV_GET_OK });
    const client = await InteractiveClient.connect(server.socketPath);
    const response = await client.request(
      "kv.get",
      { key: encodeUtf8("hi") },
      { branch: "main", space: "default" },
    );
    expect(response.type).toBe("kv_versioned_value");
    expect(response.data.found).toBe(true);
    const seen = server.requests[0]!;
    expect(seen.branch).toBe("main");
    expect(seen.space).toBe("default");
    expect(seen.command.type).toBe("kv_get");
    expect(seen.command.key).toBe("aGk=");
    client.close();
  });

  it("injects deadline budgets by request class (AR-2.5)", async () => {
    server = await FakeServer.start({ onRequest: () => ({ type: "pong", data: {} }) });
    const client = await InteractiveClient.connect(server.socketPath);
    await client.request("kv.get", { key: encodeUtf8("k") }, { branch: "main" });
    await client.request("kv.scan", {}, { branch: "main" });
    await client.request("graph.analytics.pagerank", { graph: "g" }, { branch: "main" });
    const [fast, paged, expensive] = server.requests;
    expect(fast!.deadline_ms).toBe(2_000);
    expect(paged!.deadline_ms).toBe(10_000);
    expect(expensive!.deadline_ms).toBe(60_000);
    client.close();
  });

  it("keeps exactly one request in flight (AR-2.4)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    server = await FakeServer.start({
      onRequest: () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        concurrent -= 1;
        return KV_GET_OK;
      },
    });
    const client = await InteractiveClient.connect(server.socketPath);
    await Promise.all([
      client.request("kv.get", { key: encodeUtf8("a") }, { branch: "main" }),
      client.request("kv.get", { key: encodeUtf8("b") }, { branch: "main" }),
      client.request("kv.get", { key: encodeUtf8("c") }, { branch: "main" }),
    ]);
    // The fake replies synchronously per frame; ids must arrive strictly ordered.
    expect(server.requests.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1);
    client.close();
  });

  it("blocks write-classified commands locally (AR-4.2)", async () => {
    server = await FakeServer.start();
    const client = await InteractiveClient.connect(server.socketPath);
    await expect(
      // @ts-expect-error — kv.put is write-classified; the type system rejects it and so does the runtime gate
      client.request("kv.put", { key: encodeUtf8("k"), value: encodeUtf8("v") }, { branch: "main" }),
    ).rejects.toBeInstanceOf(WriteCommandBlockedError);
    expect(server.requests.length).toBe(0); // no round trip was wasted
    await expect(
      client.requestRaw({ type: "kv_put", key: "aw==", value: "dg==" }, { branch: "main", deadlineMs: 1000 }),
    ).rejects.toBeInstanceOf(WriteCommandBlockedError);
    expect(server.requests.length).toBe(0);
    client.close();
  });

  it("treats an owner read-only refusal as a client-gate bug (AR-4.3)", async () => {
    server = await FakeServer.start({
      onRequest: () => ({
        error: { class: "access_denied", code: CODES.readOnlySession, message: "read session" },
      }),
    });
    const client = await InteractiveClient.connect(server.socketPath);
    const diagnostics: unknown[] = [];
    client.onDiagnostic((d) => diagnostics.push(d));
    await expect(
      // An unknown wire type slips past the local gate; the owner refuses it.
      client.requestRaw({ type: "kv_put_v9", key: "aw==" }, { branch: "main", deadlineMs: 1000 }),
    ).rejects.toBeInstanceOf(ReadOnlySessionViolationError);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ kind: "client-gate-bug" });
    client.close();
  });

  it("maps registered and unknown error codes by class (AR-2.7, N3)", async () => {
    const codes = [
      { class: "unavailable", code: CODES.deadlineShed, commit_outcome: "not_started" },
      { class: "not_found", code: "not_found.engine.some_future_code" },
    ];
    let call = 0;
    server = await FakeServer.start({ onRequest: () => ({ error: codes[call++] }) });
    const client = await InteractiveClient.connect(server.socketPath);

    const shed = await client
      .request("kv.get", { key: encodeUtf8("k") }, { branch: "main" })
      .catch((e: unknown) => e);
    expect(shed).toBeInstanceOf(DeadlineShedError);
    expect((shed as DeadlineShedError).commitOutcome).toBe("not_started");

    const unknown = await client
      .request("kv.get", { key: encodeUtf8("k") }, { branch: "main" })
      .catch((e: unknown) => e);
    expect(unknown).toBeInstanceOf(CommandFailedError);
    expect(unknown).not.toBeInstanceOf(DeadlineShedError);
    expect((unknown as CommandFailedError).errorClass).toBe("not_found");
    client.close();
  });

  it("kills the connection on a correlation mismatch", async () => {
    server = await FakeServer.start({ onRequest: () => null });
    const client = await InteractiveClient.connect(server.socketPath);
    const inFlight = client.request("kv.get", { key: encodeUtf8("k") }, { branch: "main" });
    await new Promise((r) => setTimeout(r, 50));
    server.sendRaw({ id: 999, payload: { type: "pong", data: {} } });
    await expect(inFlight).rejects.toBeInstanceOf(ProtocolViolationError);
    await expect(
      client.request("kv.get", { key: encodeUtf8("k") }, { branch: "main" }),
    ).rejects.toBeInstanceOf(Error); // connection is dead for good
    client.close();
  });

  it("times out client-side when the owner hangs mid-command (AR-2.5)", async () => {
    server = await FakeServer.start({ onRequest: () => null });
    const client = await InteractiveClient.connect(server.socketPath, { transportMarginMs: 100 });
    await expect(
      client.request("kv.get", { key: encodeUtf8("k") }, { branch: "main", deadlineMs: 100 }),
    ).rejects.toBeInstanceOf(RequestTimeoutError);
    client.close();
  });

  it("fails pending work when the owner dies (AR-8.2 input)", async () => {
    server = await FakeServer.start({ onRequest: () => null });
    const client = await InteractiveClient.connect(server.socketPath);
    const inFlight = client.request("kv.get", { key: encodeUtf8("k") }, { branch: "main" });
    await new Promise((r) => setTimeout(r, 50));
    server.dropConnections();
    await expect(inFlight).rejects.toBeInstanceOf(TransportError);
    client.close();
  });
});
