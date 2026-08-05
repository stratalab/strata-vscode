/**
 * Determinism / no-diff guard (AR-1.3): regeneration against the pinned rev
 * must reproduce the committed output byte-for-byte. This is the same check
 * CI runs; here it also proves the generator is deterministic in-process.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";

const TSX = path.resolve(__dirname, "../../node_modules/.bin/tsx");
const GENERATE = path.resolve(__dirname, "../../tools/generate.ts");

describe("generator", () => {
  it("reproduces the committed src/generated exactly (--check)", () => {
    const output = execFileSync(TSX, [GENERATE, "--check"], { encoding: "utf8" });
    expect(output).toContain("in sync");
  });
});
