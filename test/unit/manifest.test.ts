/**
 * Manifest lint (E0): the package.json policies that requirements pin down —
 * lazy activation (AR-7.1), workspace extension kind (AR-7.4), limited trust
 * with machine-scoped binaryPath (AR-7.5), and the MCP API floor (F6.1).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
);

describe("package manifest", () => {
  it("never activates eagerly (AR-7.1)", () => {
    const events: string[] = pkg.activationEvents ?? [];
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event).not.toBe("*");
      expect(event).not.toMatch(/^onStartupFinished/);
      expect(event).toMatch(/^workspaceContains:/);
    }
  });

  it("runs where the database lives (AR-7.4)", () => {
    expect(pkg.extensionKind).toEqual(["workspace"]);
  });

  it("declares limited workspace trust with binaryPath restricted (AR-7.5)", () => {
    const trust = pkg.capabilities?.untrustedWorkspaces;
    expect(trust?.supported).toBe("limited");
    expect(trust?.restrictedConfigurations).toContain("strata.binaryPath");
    expect(pkg.contributes.configuration.properties["strata.binaryPath"].scope).toBe("machine");
  });

  it("pins the engine floor where McpServerDefinitionProvider is stable (F6.1)", () => {
    const match = /\^(\d+)\.(\d+)\./.exec(pkg.engines.vscode);
    expect(match).not.toBeNull();
    const [, major, minor] = match!;
    expect(Number(major) * 1000 + Number(minor)).toBeGreaterThanOrEqual(1101);
  });

  it("identifies as the planned marketplace artifact (N6)", () => {
    expect(pkg.publisher).toBe("stratalab");
    expect(pkg.name).toBe("strata-vscode");
    expect(pkg.displayName).toBe("StrataDB");
  });
});
