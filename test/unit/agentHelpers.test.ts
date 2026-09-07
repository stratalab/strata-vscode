import { describe, expect, it } from "vitest";
import {
  branchHandoffPrompt,
  inferenceDocsUrl,
  mcpSetupForDatabase,
  mcpSetupForDatabases,
  primitiveDocsUrl,
  strataApiDocsUrl,
  starterSnippet,
} from "../../src/agent/helpers";

describe("AI agent helper text", () => {
  it("copies MCP setup for one database", () => {
    const parsed = JSON.parse(mcpSetupForDatabase("/w/db", "/bin/strata"));
    expect(parsed.mcpServers.strata).toEqual({
      command: "/bin/strata",
      args: ["--db", "/w/db", "mcp", "serve"],
    });
  });

  it("copies MCP setup for every connected workspace database", () => {
    const parsed = JSON.parse(mcpSetupForDatabases(["/w/a/db", "/w/b/db"], null));
    expect(Object.keys(parsed.mcpServers).sort()).toEqual(["strata-db", "strata-db-2"]);
    expect(parsed.mcpServers["strata-db"].command).toBe("strata");
  });

  it("builds scoped starter snippets without inventing an SDK", () => {
    const scope = { dbPath: "/w/db", branch: "main", space: "app", primitive: "kv" as const };
    const ts = starterSnippet("typescript", scope, null);
    const py = starterSnippet("python", scope, "/bin/strata");

    expect(ts).toContain("spawnSync");
    expect(ts).toContain('"--db"');
    expect(ts).toContain('"/w/db"');
    expect(ts).toContain('"--branch"');
    expect(py).toContain("subprocess.run");
    expect(py).toContain("/bin/strata");
  });

  it("builds generated API docs URLs", () => {
    expect(primitiveDocsUrl("json")).toBe("https://stratadb.org/docs/json/list");
    expect(strataApiDocsUrl()).toBe("https://stratadb.org/docs/admin/info");
    expect(inferenceDocsUrl("inference.generate")).toBe("https://stratadb.org/docs/inference/generate");
  });

  it("copies a branch handoff prompt for Python SDK agents", () => {
    const text = branchHandoffPrompt({ dbPath: "/w/memory", branch: "experiment", space: "default" });

    expect(text).toContain("Database: /w/memory");
    expect(text).toContain("Branch: experiment");
    expect(text).toContain("stratadb.open");
    expect(text).toContain('db.at(branch="experiment", space="default")');
  });
});
