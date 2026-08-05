/**
 * Activation smoke (E0): the extension activates lazily via the
 * workspaceContains layout marker (AR-7.1) — the fixture workspace carries
 * db/manifest/current — and contributes its command.
 */
import * as assert from "node:assert";
import * as vscode from "vscode";

describe("activation smoke", () => {
  it("activates via the workspaceContains layout marker (AR-7.1)", async () => {
    const extension = vscode.extensions.getExtension("stratalab.strata-vscode");
    assert.ok(extension, "extension stratalab.strata-vscode not found in the dev host");

    // Lazy activation: the file-presence scan fires shortly after startup.
    const deadline = Date.now() + 15_000;
    while (!extension.isActive && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(extension.isActive, "extension did not activate on the layout marker");
  });

  it("contributes the Strata: Refresh Databases command", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("strata.refreshDatabases"));
  });
});
