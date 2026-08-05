/**
 * Hello exchange and skew detection (AR-2.3, AR-6.1) against the fake owner.
 */
import { afterEach, describe, expect, it } from "vitest";
import { FakeServer } from "../harness/fakeServer";
import { WireConnection } from "../../src/wire/connection";
import { HelloRefusedError, OwnerAtCapacityError, TransportError, CODES } from "../../src/wire/errors";
import { IDL_STAMPS } from "../../src/generated";

let server: FakeServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("wire connection", () => {
  it("completes the hello and reports matching stamps", async () => {
    server = await FakeServer.start();
    const connection = await WireConnection.connect(server.socketPath);
    expect(connection.serverHello.granted_access).toBe("read");
    expect(connection.skew.matches).toBe(true);
    expect(connection.skew.local.schema_version).toBe(IDL_STAMPS.schemaVersion);
    connection.close();
  });

  it("reports skew without failing the connection (AR-6.1)", async () => {
    server = await FakeServer.start({
      stamps: { schema_version: "strata.idl.v2", generator_version: "strata-executor-idl.9" },
      release: "9.9.9",
    });
    const connection = await WireConnection.connect(server.socketPath);
    expect(connection.skew.matches).toBe(false);
    expect(connection.skew.owner.schema_version).toBe("strata.idl.v2");
    expect(connection.skew.ownerRelease).toBe("9.9.9");
    connection.close();
  });

  it("surfaces a refused hello as HelloRefusedError, never a retry (AR-2.3)", async () => {
    server = await FakeServer.start({
      refuseHello: { class: "invalid_argument", code: CODES.helloRefused, message: "unsupported protocol" },
    });
    await expect(WireConnection.connect(server.socketPath)).rejects.toBeInstanceOf(HelloRefusedError);
  });

  it("maps a capacity refusal to OwnerAtCapacityError (AR-2.7)", async () => {
    server = await FakeServer.start({
      refuseHello: { class: "resource_exhausted", code: CODES.atCapacity, message: "at capacity" },
    });
    await expect(WireConnection.connect(server.socketPath)).rejects.toBeInstanceOf(OwnerAtCapacityError);
  });

  it("times out a silent hello as a transport error", async () => {
    server = await FakeServer.start({ silentHello: true });
    await expect(
      WireConnection.connect(server.socketPath, { helloTimeoutMs: 200 }),
    ).rejects.toBeInstanceOf(TransportError);
  });
});
