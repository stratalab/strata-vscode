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
const removedAgentCommand = `strata.${["ask", "Agent", "To", "Use", "Database"].join("")}`;

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

  it("keeps Explorer first and AI agent help as a first-class Strata sidebar view", () => {
    const views = pkg.contributes.views.strata ?? [];
    expect(views[0]).toMatchObject({ id: "strataExplorer", name: "Explorer" });
    expect(views[1]).toMatchObject({ id: "strataAgent", name: "AI Agent", type: "webview" });
    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("view\":\"strataAgent");
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

  it("surfaces database create and connect commands from the explorer", () => {
    const commandIds = new Set((pkg.contributes.commands ?? []).map((command: { command: string }) => command.command));
    expect(commandIds.has("strata.createDatabase")).toBe(true);
    expect(commandIds.has("strata.connectDatabase")).toBe(true);
    expect(commandIds.has("strata.browseHub")).toBe(true);
    expect(commandIds.has("strata.openStatus")).toBe(true);
    expect(commandIds.has("strata.disconnectDatabase")).toBe(true);
    expect(commandIds.has("strata.removeDatabase")).toBe(true);
    expect(commandIds.has("strata.copyMcpSetup")).toBe(true);
    expect(commandIds.has("strata.copyStarterSnippet")).toBe(true);
    expect(commandIds.has("strata.forkBranch")).toBe(true);
    expect(commandIds.has("strata.diffBranches")).toBe(true);
    expect(commandIds.has("strata.copyBranchHandoff")).toBe(true);
    expect(commandIds.has(removedAgentCommand)).toBe(false);
    expect(commandIds.has("strata.openPrimitiveDocs")).toBe(true);
    expect(commandIds.has("strata.attachDatabase")).toBe(false);

    const titleCommands = new Set(
      (pkg.contributes.menus["view/title"] ?? []).map((item: { command: string }) => item.command),
    );
    expect(titleCommands.has("strata.createDatabase")).toBe(true);
    expect(titleCommands.has("strata.connectDatabase")).toBe(true);
    expect(titleCommands.has("strata.browseHub")).toBe(true);
    expect(titleCommands.has("strata.openStatus")).toBe(true);

    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("strata.createDatabase");
    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("strata.connectDatabase");
    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("strata.browseHub");
    expect(JSON.stringify(pkg.contributes)).not.toContain("Attach Existing Database");
  });

  it("keeps database item context actions focused on connection and branch workflows", () => {
    const menuItems = pkg.contributes.menus["view/item/context"] ?? [];
    const databaseMenuItems = menuItems.filter((item: { when?: string }) => item.when?.includes("strata-db"));
    const databaseCommands = new Set(databaseMenuItems.map((item: { command: string }) => item.command));

    expect(databaseCommands.has("strata.connectDatabaseItem")).toBe(true);
    expect(databaseCommands.has("strata.disconnectDatabase")).toBe(true);
    expect(databaseCommands.has("strata.removeDatabase")).toBe(true);
    expect(databaseCommands.has("strata.copyMcpSetup")).toBe(false);
    expect(databaseCommands.has("strata.copyStarterSnippet")).toBe(false);
    expect(databaseCommands.has("strata.forkBranch")).toBe(true);
    expect(databaseCommands.has("strata.diffBranches")).toBe(true);
    expect(databaseCommands.has("strata.copyBranchHandoff")).toBe(false);
    expect(databaseCommands.has(removedAgentCommand)).toBe(false);
    expect(databaseCommands.has("strata.timeTravel")).toBe(false);
    expect(databaseCommands.has("strata.stopHost")).toBe(false);

    const hiddenPaletteCommands = new Set(
      (pkg.contributes.menus.commandPalette ?? [])
        .filter((item: { when?: string }) => item.when === "false")
        .map((item: { command: string }) => item.command),
    );
    expect(hiddenPaletteCommands.has("strata.connectDatabaseItem")).toBe(true);
    expect(hiddenPaletteCommands.has("strata.disconnectDatabase")).toBe(true);
    expect(hiddenPaletteCommands.has("strata.removeDatabase")).toBe(true);
    expect(hiddenPaletteCommands.has("strata.copyMcpSetup")).toBe(true);
    expect(hiddenPaletteCommands.has("strata.copyStarterSnippet")).toBe(true);
    expect(hiddenPaletteCommands.has(removedAgentCommand)).toBe(false);
    expect(hiddenPaletteCommands.has("strata.openPrimitiveDocs")).toBe(true);
  });

  it("keeps primitive context focused on API docs", () => {
    const menuItems = pkg.contributes.menus["view/item/context"] ?? [];
    const primitiveMenuItems = menuItems.filter((item: { when?: string }) => item.when?.includes("strata-primitive"));
    const primitiveCommands = new Set(primitiveMenuItems.map((item: { command: string }) => item.command));

    expect(primitiveCommands.has("strata.copyStarterSnippet")).toBe(false);
    expect(primitiveCommands.has(removedAgentCommand)).toBe(false);
    expect(primitiveCommands.has("strata.openPrimitiveDocs")).toBe(true);
  });

  it("does not make branch rows open a separate branch picker", () => {
    const menuItems = pkg.contributes.menus["view/item/context"] ?? [];
    const branchMenuItems = menuItems.filter((item: { when?: string }) => item.when?.includes("strata-branch"));
    const branchCommands = branchMenuItems.map((item: { command: string }) => item.command);
    expect(branchCommands).not.toContain("strata.selectBranch");
    expect(branchCommands).toContain("strata.forkBranch");
    expect(branchCommands).toContain("strata.diffBranches");
    expect(branchCommands).toContain("strata.copyBranchHandoff");
  });

  it("activates for the local object-store current pointer suffix", () => {
    expect(pkg.activationEvents).toContain("workspaceContains:**/manifest/current.object@");
  });
});
