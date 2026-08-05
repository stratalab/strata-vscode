import * as vscode from "vscode";
import { IDL_STAMPS, STRATA_CORE_REV, COMMAND_IDS, READ_COMMAND_IDS } from "./generated";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("StrataDB");
  output.appendLine(
    `StrataDB activated — IDL ${IDL_STAMPS.schemaVersion} (${IDL_STAMPS.generatorVersion}), ` +
      `strata-core ${STRATA_CORE_REV.slice(0, 12)}, ` +
      `${COMMAND_IDS.length} commands (${READ_COMMAND_IDS.length} read-class)`,
  );

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("strata.refreshDatabases", () => {
      void vscode.window.showInformationMessage(
        "StrataDB: database discovery and attach land in M2 (E4) — see docs/implementation-plan.md.",
      );
    }),
  );
}

export function deactivate(): void {
  // Read-only surface: nothing to flush (AR-8.4). Connection teardown arrives with E2/E4.
}
