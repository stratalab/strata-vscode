/**
 * Terminology guard (U5, design-plan §7): one register, one name per
 * concept. Banned strings are deliberate, reviewed decisions — mirroring
 * the N4 log-site allowlist pattern. Additions to the product vocabulary
 * belong in the design plan first.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const BANNED: Array<{ pattern: string; why: string }> = [
  { pattern: "⏪", why: "time travel speaks with $(history)/codicon-history + 'as of', never emoji" },
  { pattern: "client(s)", why: "pluralize properly (SB-2)" },
  { pattern: "console: ", why: "result docs are titled '<command> — result' (CN-4)" },
  { pattern: "// closed", why: "inspector placeholders are valid JSON (IN-1)" },
];

describe("terminology (§7)", () => {
  it("user-facing sources carry no banned vocabulary", () => {
    const files = execFileSync("grep", ["-rl", "", "--include=*.ts", path.join(ROOT, "src")], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((f) => !f.includes("/generated/"));
    files.push(path.join(ROOT, "package.json"));
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const { pattern, why } of BANNED) {
        expect(
          content.includes(pattern),
          `${path.relative(ROOT, file)} contains banned "${pattern}" — ${why}`,
        ).toBe(false);
      }
    }
  });
});
