import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(extensionDevelopmentPath, "out-e2e/suite/index");
  const workspacePath = path.resolve(extensionDevelopmentPath, "test/e2e/fixtures/workspace");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspacePath, "--disable-extensions"],
  });
}

main().catch((error) => {
  console.error("e2e run failed:", error);
  process.exit(1);
});
