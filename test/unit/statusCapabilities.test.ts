import { describe, expect, it } from "vitest";
import { STRATA_CORE_REV } from "../../src/generated";
import { binaryMeetsMinimum, capabilityStatus, REQUIRED_ENGINE_VERSION, versionMeetsMinimum } from "../../src/status/capabilities";
import type { BinaryStatus, HubStatus, McpStatus } from "../../src/status/shared";

const binary = (version: string | null, found = true): BinaryStatus => ({
  found,
  path: found ? "/usr/local/bin/strata" : null,
  version,
  level: found ? "ok" : "bad",
  message: found ? "found" : "missing",
});

const hub = (warning: string | null = null): HubStatus => ({
  url: "https://hub.stratahub.io/",
  source: "strata config",
  overridden: false,
  warning,
  level: warning ? "warn" : "ok",
  message: warning ?? "Hub URL resolved.",
});

const mcp = (level: McpStatus["level"] = "ok"): McpStatus => ({
  consent: "always",
  nativeProvider: "available",
  level,
  message: level === "ok" ? "Registered" : "Needs registration",
  files: [],
});

function byId(statuses: ReturnType<typeof capabilityStatus>) {
  return Object.fromEntries(statuses.map((status) => [status.id, status]));
}

describe("Status Center capability readiness", () => {
  it("marks the 1.2.2-era engine capability set ready for a modern binary", () => {
    const statuses = byId(capabilityStatus(binary(`strata ${REQUIRED_ENGINE_VERSION}`), hub(), mcp()));

    expect(statuses["engine-1.2.2"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["hub-browse"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["clone-progress"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["kv-prefix"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["committed-at"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["no-human-output"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["hub-url"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["mcp-registration"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["idl-pin"]?.detail).toContain(STRATA_CORE_REV.slice(0, 12));
  });

  it("warns for older binaries without hiding independent setup facts", () => {
    const statuses = byId(capabilityStatus(binary("strata 1.2.1"), hub("Using fallback hub"), mcp("warn")));

    expect(binaryMeetsMinimum(binary("strata 1.2.1"))).toBe(false);
    expect(versionMeetsMinimum("strata 1.2.2")).toBe(true);
    expect(statuses["engine-1.2.2"]).toMatchObject({ level: "warn", available: false });
    expect(statuses["kv-prefix"]).toMatchObject({ level: "warn", available: false });
    expect(statuses["hub-url"]).toMatchObject({ level: "warn", available: true });
    expect(statuses["mcp-registration"]).toMatchObject({ level: "warn", available: false });
    expect(statuses["idl-pin"]).toMatchObject({ level: "ok", available: true });
  });

  it("uses bad severity when no Strata binary is available", () => {
    const statuses = byId(capabilityStatus(binary(null, false), hub(), mcp("info")));

    expect(binaryMeetsMinimum(binary(null, false))).toBe(false);
    expect(statuses["engine-1.2.2"]).toMatchObject({ level: "bad", available: false });
    expect(statuses["hub-browse"]).toMatchObject({ level: "bad", available: false });
    expect(statuses["clone-progress"]).toMatchObject({ level: "bad", available: false });
    expect(statuses["hub-url"]).toMatchObject({ level: "ok", available: true });
    expect(statuses["mcp-registration"]).toMatchObject({ level: "info", available: true });
  });
});
