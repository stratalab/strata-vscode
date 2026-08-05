/**
 * Resolves the `strata` binary for cross-process tests (N7): STRATA_BIN env,
 * then a sibling strata-core checkout's build output, then PATH. Integration
 * suites self-skip (loudly) when no binary is available.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

export function resolveStrataBin(): string | null {
  const fromEnv = process.env.STRATA_BIN;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  for (const profile of ["debug", "release"]) {
    const sibling = path.resolve(REPO_ROOT, "..", "strata-core", "target", profile, "strata");
    if (fs.existsSync(sibling)) return sibling;
  }

  try {
    const found = execFileSync("which", ["strata"], { encoding: "utf8" }).trim();
    if (found) return found;
  } catch {
    // not on PATH
  }
  return null;
}
