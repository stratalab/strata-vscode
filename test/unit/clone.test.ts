/**
 * Clone wrapper (F5) against a scripted stub binary: success, every F5.3
 * registry code with its hint, destination collisions, and unparseable
 * output — all mapped by code, never message text (N3).
 */
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runClone } from "../../src/hub/clone";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svclone-"));
  dirs.push(dir);
  return dir;
}

/** A stub strata binary that prints a canned line and exits. */
function stubBinary(stdout: string, exitCode: number): string {
  const dir = scratch();
  const bin = path.join(dir, "strata");
  fs.writeFileSync(bin, `#!/bin/sh\necho '${stdout.replace(/'/g, `'\\''`)}'\nexit ${exitCode}\n`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

const HUB_CODES = [
  "invalid_argument.executor.hub_url",
  "invalid_argument.executor.hub_dataset",
  "invalid_argument.executor.hub_branch",
  "unavailable.executor.hub_transport",
  "failed_precondition.executor.hub_clone",
  "invalid_argument.executor.hub_feature_disabled",
];

describe("clone wrapper (F5)", () => {
  it("maps a success envelope", async () => {
    const bin = stubBinary('{"type":"hub_clone","data":{"dataset":"d","branch":"default"}}', 0);
    const result = await runClone(bin, { dataset: "d", dest: path.join(scratch(), "new-db") });
    expect(result.ok).toBe(true);
  });

  it("maps every registered hub error code with its hint and docs link (F5.3)", async () => {
    for (const code of HUB_CODES) {
      const cls = code.split(".")[0]!;
      const bin = stubBinary(
        JSON.stringify({
          error: {
            class: cls,
            code,
            message: `m-${code}`,
            suggested_fix: `fix-${code}`,
            docs_url: `https://stratadb.org/e/${code}`,
            retryable: code.includes("transport"),
          },
        }),
        1,
      );
      const result = await runClone(bin, { dataset: "d", dest: path.join(scratch(), "db") });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe(code);
      expect(result.error.suggestedFix).toBe(`fix-${code}`);
      expect(result.error.docsUrl).toBe(`https://stratadb.org/e/${code}`);
      expect(result.error.retryable).toBe(code.includes("transport"));
    }
  });

  it("refuses an existing destination before spawning anything", async () => {
    const dest = scratch(); // exists
    const bin = stubBinary("should-never-run", 0);
    const result = await runClone(bin, { dataset: "d", dest });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("failed_precondition.executor.hub_clone");
      expect(result.error.message).toContain("already exists");
    }
  });

  it("degrades unparseable output to a typed client error", async () => {
    const bin = stubBinary("panic: something rustic", 101);
    const result = await runClone(bin, { dataset: "d", dest: path.join(scratch(), "db") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("client.clone_output_unparseable");
      expect(result.error.message).toContain("something rustic");
    }
  });

  it("passes branch and hub overrides through to the CLI", async () => {
    const dir = scratch();
    const bin = path.join(dir, "strata");
    const argsFile = path.join(dir, "args.txt");
    fs.writeFileSync(bin, `#!/bin/sh\necho "$@" > ${argsFile}\necho '{"type":"hub_clone","data":{}}'\n`);
    fs.chmodSync(bin, 0o755);
    await runClone(bin, { dataset: "team/data", dest: path.join(dir, "db"), branch: "exp", hubUrl: "https://hub.example" });
    const args = fs.readFileSync(argsFile, "utf8");
    expect(args).toContain("clone team/data");
    expect(args).toContain("--branch exp");
    expect(args).toContain("--hub https://hub.example");
    expect(args).toContain("--json");
  });
});
