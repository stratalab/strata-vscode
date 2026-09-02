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

  it("surfaces database create and connect commands from the explorer", () => {
    const commandIds = new Set((pkg.contributes.commands ?? []).map((command: { command: string }) => command.command));
    expect(commandIds.has("strata.createDatabase")).toBe(true);
    expect(commandIds.has("strata.connectDatabase")).toBe(true);
    expect(commandIds.has("strata.browseHub")).toBe(true);
    expect(commandIds.has("strata.disconnectDatabase")).toBe(true);
    expect(commandIds.has("strata.removeDatabase")).toBe(true);
    expect(commandIds.has("strata.attachDatabase")).toBe(false);

    const titleCommands = new Set(
      (pkg.contributes.menus["view/title"] ?? []).map((item: { command: string }) => item.command),
    );
    expect(titleCommands.has("strata.createDatabase")).toBe(true);
    expect(titleCommands.has("strata.connectDatabase")).toBe(true);
    expect(titleCommands.has("strata.browseHub")).toBe(true);

    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("strata.createDatabase");
    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("strata.connectDatabase");
    expect(JSON.stringify(pkg.contributes.viewsWelcome)).toContain("strata.browseHub");
    expect(JSON.stringify(pkg.contributes)).not.toContain("Attach Existing Database");
  });

  it("keeps database item context actions focused on connection management", () => {
    const menuItems = pkg.contributes.menus["view/item/context"] ?? [];
    const databaseMenuItems = menuItems.filter((item: { when?: string }) => item.when?.includes("strata-db"));
    const databaseCommands = new Set(databaseMenuItems.map((item: { command: string }) => item.command));

    expect(databaseCommands.has("strata.connectDatabaseItem")).toBe(true);
    expect(databaseCommands.has("strata.disconnectDatabase")).toBe(true);
    expect(databaseCommands.has("strata.removeDatabase")).toBe(true);
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
  });

  it("does not make branch rows open a separate branch picker", () => {
    const menuItems = pkg.contributes.menus["view/item/context"] ?? [];
    const branchMenuItems = menuItems.filter((item: { when?: string }) => item.when?.includes("strata-branch"));
    expect(branchMenuItems.map((item: { command: string }) => item.command)).not.toContain("strata.selectBranch");
  });

  it("activates for the local object-store current pointer suffix", () => {
    expect(pkg.activationEvents).toContain("workspaceContains:**/manifest/current.object@");
  });
});
