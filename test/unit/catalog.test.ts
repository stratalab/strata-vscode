/**
 * Catalog integrity (AR-1.2/1.5/1.6): the generated command catalog against
 * the counts and facets the requirements doc pins (§3.1, F3.1).
 */
import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  COMMAND_IDS,
  READ_COMMAND_IDS,
  WRITE_COMMAND_IDS,
  WIRE_TYPE_TO_COMMAND,
} from "../../src/generated";

describe("command catalog", () => {
  it("carries all 127 commands, 82 read / 45 write (§3.1)", () => {
    expect(COMMAND_IDS.length).toBe(127);
    expect(READ_COMMAND_IDS.length).toBe(82);
    expect(WRITE_COMMAND_IDS.length).toBe(45);
  });

  it("has 19 wire-only commands with no CLI verb (AR-1.6)", () => {
    const wireOnly = COMMAND_IDS.filter((id) => COMMANDS[id].cliSurface === "wire");
    expect(wireOnly.length).toBe(19);
    for (const id of wireOnly) {
      expect(COMMANDS[id].cliDisplay).toBeNull();
    }
  });

  it("classifies the read-only-session enforcement examples as writes (§3.1)", () => {
    expect(COMMANDS["admin.ipc_stop"].access).toBe("write");
    expect(COMMANDS["admin.hub_clone"].access).toBe("write");
  });

  it("gives every command a unique wire type routable back to its id", () => {
    const seen = new Set<string>();
    for (const id of COMMAND_IDS) {
      const wireType = COMMANDS[id].wireType;
      expect(wireType).toMatch(/^[a-z0-9_]+$/);
      expect(seen.has(wireType)).toBe(false);
      seen.add(wireType);
      expect(WIRE_TYPE_TO_COMMAND[wireType]).toBe(id);
    }
  });

  it("renders kv.get the way the requirements describe it", () => {
    const entry = COMMANDS["kv.get"];
    expect(entry.family).toBe("kv");
    expect(entry.access).toBe("read");
    expect(entry.wireType).toBe("kv_get");
    expect(entry.cliDisplay).toBe("strata kv get");
    expect(entry.title.length).toBeGreaterThan(0);
    expect(entry.summary.length).toBeGreaterThan(0);
  });

  it("keeps searchable prose on every command (F3.1)", () => {
    for (const id of COMMAND_IDS) {
      expect(COMMANDS[id].title.length, id).toBeGreaterThan(0);
      expect(COMMANDS[id].summary.length, id).toBeGreaterThan(0);
    }
  });
});
