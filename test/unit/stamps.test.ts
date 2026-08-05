/**
 * Stamp validation (AR-1.4): the generated stamps must mirror the vendored
 * artifacts exactly — they are what the hello sends and what skew detection
 * compares against.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import { IDL_STAMPS, STRATA_CORE_REV } from "../../src/generated";

const IDL_DIR = path.resolve(__dirname, "../../idl/v1");

describe("IDL stamps", () => {
  it("match the vendored manifest", () => {
    const manifest = YAML.parse(fs.readFileSync(path.join(IDL_DIR, "manifest.yaml"), "utf8"));
    expect(IDL_STAMPS.schemaVersion).toBe(manifest.schema_version);
    expect(IDL_STAMPS.generatorVersion).toBe(manifest.generator_version);
  });

  it("pin a full strata-core revision", () => {
    const pinned = fs.readFileSync(path.join(IDL_DIR, "STRATA_CORE_REV"), "utf8").trim();
    expect(STRATA_CORE_REV).toBe(pinned);
    expect(STRATA_CORE_REV).toMatch(/^[0-9a-f]{40}$/);
  });

  it("carry the v1 contract identifiers", () => {
    expect(IDL_STAMPS.schemaVersion).toBe("strata.idl.v1");
    expect(IDL_STAMPS.generatorVersion).toBe("strata-executor-idl.1");
  });
});
