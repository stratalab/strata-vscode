/**
 * Log redaction audit (N4): row contents never leave the machine, and logs
 * redact values by default. Every OutputChannel call site in src/ must be on
 * the audited allowlist — a new log line is a deliberate, reviewed act.
 * Ad-hoc console logging is banned by eslint (no-console).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";

const SRC = path.resolve(__dirname, "../../src");

/** file → substring that identifies each audited appendLine call site. */
const AUDITED_LOG_SITES = [
  { file: "extension.ts", marker: "StrataDB activated" }, // stamps + counts only
  { file: "extension.ts", marker: "re-adopted" }, // database paths only
  { file: "extension.ts", marker: "strata doctor" }, // doctor health report
  { file: "extension.ts", marker: "doctor failed" }, // error message only
];

describe("log redaction (N4)", () => {
  it("every appendLine call site is on the audited allowlist", () => {
    const output = execFileSync("grep", ["-rn", "appendLine", SRC], { encoding: "utf8" });
    const sites = output.trim().split("\n").filter(Boolean);
    for (const site of sites) {
      const known = AUDITED_LOG_SITES.some(
        (entry) => site.includes(`/${entry.file}:`),
      );
      expect(known, `unaudited log site (add to the N4 allowlist deliberately): ${site}`).toBe(true);
    }
    // The allowlist itself must not go stale.
    for (const entry of AUDITED_LOG_SITES) {
      const source = execFileSync("cat", [path.join(SRC, entry.file)], { encoding: "utf8" });
      expect(source.includes(entry.marker), `stale allowlist entry: ${entry.marker}`).toBe(true);
    }
  });

  it("no decoded row values flow into log lines", () => {
    // The decode helpers are the only place bytes become display text; none
    // of their results may reach an appendLine call in the same expression.
    const output = execFileSync("grep", ["-rn", "appendLine", SRC], { encoding: "utf8" });
    for (const banned of ["previewValue", "decodeValue", "keyText", ".value.value"]) {
      expect(output.includes(banned), `log line references decoded values: ${banned}`).toBe(false);
    }
  });
});
