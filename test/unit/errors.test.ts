/**
 * Error registry (AR-1.2, AR-2.7, N3): the registered transport codes the
 * client must key on, and the class/docs derivation for every code.
 */
import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_REGISTRY } from "../../src/generated";

const TRANSPORT_CODES = [
  "invalid_argument.executor.ipc_hello",
  "invalid_argument.executor.wire_request",
  "access_denied.executor.read_only_session",
  "unavailable.executor.ipc_deadline",
  "resource_exhausted.executor.ipc_connections",
  "unavailable.executor.ipc_transport",
  "internal.executor.wire_response",
];

describe("error registry", () => {
  it("registers every Appendix-A transport code", () => {
    for (const code of TRANSPORT_CODES) {
      expect(ERROR_REGISTRY[code], code).toBeDefined();
    }
  });

  it("derives class and layer from the code shape", () => {
    const shed = ERROR_REGISTRY["unavailable.executor.ipc_deadline"]!;
    expect(shed.errorClass).toBe("unavailable");
    expect(shed.layer).toBe("executor");
    for (const code of ERROR_CODES) {
      const entry = ERROR_REGISTRY[code]!;
      if (entry.layer === "inference") {
        // Boundary codes have no static class segment (inference.<slug>).
        expect(entry.errorClass).toBeNull();
        expect(code.startsWith("inference."), code).toBe(true);
      } else {
        expect(code.startsWith(`${entry.errorClass}.${entry.layer}.`), code).toBe(true);
      }
    }
  });

  it("links every code to its public docs page (F3.5)", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_REGISTRY[code]!.docsUrl).toBe(`https://stratadb.org/e/${code}`);
    }
  });
});
