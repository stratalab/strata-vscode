/**
 * MCP registration writers (F6.2/F6.3): workspace-scoped entries, idempotent
 * and merge-safe writes, refusal on malformed files, exact reversibility.
 */
import { describe, expect, it } from "vitest";
import {
  applyStrataEntries,
  buildStrataEntries,
  removeStrataEntries,
} from "../../src/mcp/registration";

const BIN = "/usr/local/bin/strata";

describe("entry building (F6.3)", () => {
  it("pins a single workspace database to one `strata` entry", () => {
    const entries = buildStrataEntries(["/w/agent-memory"], BIN);
    expect(entries).toEqual({
      strata: { command: BIN, args: ["--db", "/w/agent-memory", "mcp", "serve"] },
    });
  });

  it("names entries per database in multi-database workspaces (transitional)", () => {
    const entries = buildStrataEntries(["/w/a/db", "/w/b/db"], BIN);
    expect(Object.keys(entries).sort()).toEqual(["strata-db", "strata-db-2"]);
  });

  it("uses the resolved machine-scoped binary path (F6.4)", () => {
    const entries = buildStrataEntries(["/w/db"], "/opt/strata/bin/strata");
    expect(entries.strata!.command).toBe("/opt/strata/bin/strata");
  });
});

describe("writes (F6.2)", () => {
  const ENTRIES = buildStrataEntries(["/w/db"], BIN);

  it("creates a fresh config and is idempotent to the byte", () => {
    const first = applyStrataEntries(null, ENTRIES);
    expect(first.kind).toBe("updated");
    const content = (first as { content: string }).content;
    expect(JSON.parse(content).mcpServers.strata.args).toContain("/w/db");
    expect(applyStrataEntries(content, ENTRIES)).toEqual({ kind: "unchanged" });
  });

  it("preserves foreign entries and unknown top-level keys", () => {
    const existing = JSON.stringify(
      { theirSetting: true, mcpServers: { github: { command: "gh-mcp", args: [] } } },
      null,
      2,
    );
    const result = applyStrataEntries(existing, ENTRIES);
    const updated = JSON.parse((result as { content: string }).content);
    expect(updated.theirSetting).toBe(true);
    expect(updated.mcpServers.github).toEqual({ command: "gh-mcp", args: [] });
    expect(updated.mcpServers.strata).toBeDefined();
  });

  it("drops stale managed entries when databases leave, never foreign ones", () => {
    const withTwo = applyStrataEntries(null, buildStrataEntries(["/w/a/db", "/w/b/db"], BIN));
    const content = (withTwo as { content: string }).content;
    const shrunk = applyStrataEntries(content, buildStrataEntries(["/w/a/db"], BIN));
    const updated = JSON.parse((shrunk as { content: string }).content);
    expect(Object.keys(updated.mcpServers)).toEqual(["strata"]);
  });

  it("refuses malformed configs instead of overwriting", () => {
    const result = applyStrataEntries("{not json", ENTRIES);
    expect(result.kind).toBe("refused");
    expect((result as { reason: string }).reason).toContain("not valid JSON");
    expect(applyStrataEntries('["an array"]', ENTRIES).kind).toBe("refused");
  });

  it("removal deletes exactly the managed entries (reversibility)", () => {
    const existing = JSON.stringify(
      {
        mcpServers: {
          github: { command: "gh-mcp", args: [] },
          strata: { command: BIN, args: [] },
          "strata-other": { command: BIN, args: [] },
          stratasomething: { command: "not-ours", args: [] },
        },
      },
      null,
      2,
    );
    const result = removeStrataEntries(existing);
    const updated = JSON.parse((result as { content: string }).content);
    expect(Object.keys(updated.mcpServers).sort()).toEqual(["github", "stratasomething"]);
    expect(removeStrataEntries((result as { content: string }).content)).toEqual({ kind: "unchanged" });
    expect(removeStrataEntries(null)).toEqual({ kind: "unchanged" });
  });
});
