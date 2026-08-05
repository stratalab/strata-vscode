/**
 * Coverage-guard failure modes (AR-1.3): the guard must fail when a command
 * is unaccounted for, when the ledger goes stale, and when surfaced/ledger
 * overlap — and pass on a clean partition.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const GUARD = path.resolve(__dirname, "../../tools/coverage-guard.ts");
const TSX = path.resolve(__dirname, "../../node_modules/.bin/tsx");

interface GuardResult {
  status: number;
  output: string;
}

function runGuard(setup: {
  commands: string[];
  surfaced: string[];
  ledger: Record<string, { status: string; reason?: string }>;
}): GuardResult {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "guard-test-"));
  try {
    fs.mkdirSync(path.join(root, "idl", "v1", "generated"), { recursive: true });
    fs.mkdirSync(path.join(root, "coverage"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "idl", "v1", "generated", "command-index.json"),
      JSON.stringify({ commands: setup.commands.map((id) => ({ id, family: id.split(".")[0] })) }),
    );
    fs.writeFileSync(path.join(root, "coverage", "surfaced.json"), JSON.stringify(setup.surfaced));
    fs.writeFileSync(path.join(root, "coverage", "ledger.json"), JSON.stringify(setup.ledger));
    try {
      const output = execFileSync(TSX, [GUARD, "--root", root], { encoding: "utf8" });
      return { status: 0, output };
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      return { status: failure.status, output: failure.stderr };
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("coverage guard", () => {
  it("passes on a clean partition", () => {
    const result = runGuard({
      commands: ["kv.get", "kv.put"],
      surfaced: ["kv.get"],
      ledger: { "kv.put": { status: "pending" } },
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain("ok — 1 surfaced, 1 pending");
  });

  it("fails when a command is neither surfaced nor ledgered", () => {
    const result = runGuard({
      commands: ["kv.get", "kv.put"],
      surfaced: ["kv.get"],
      ledger: {},
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("kv.put is neither surfaced nor in the exclusion ledger");
  });

  it("fails on a stale ledger entry", () => {
    const result = runGuard({
      commands: ["kv.get"],
      surfaced: ["kv.get"],
      ledger: { "kv.removed": { status: "pending" } },
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("unknown command: kv.removed");
  });

  it("fails when a command is both surfaced and ledgered", () => {
    const result = runGuard({
      commands: ["kv.get"],
      surfaced: ["kv.get"],
      ledger: { "kv.get": { status: "pending" } },
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("both surfaced and ledgered");
  });
});
