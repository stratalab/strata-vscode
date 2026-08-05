/**
 * Generated types against the vendored fixture corpus (N7: "the IDL
 * toolchain's generated fixtures are the request corpus"), plus compile-time
 * assertions on the byte boundary (AR-1.7).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { COMMANDS, COMMAND_IDS } from "../../src/generated";
import type { KvGetRequest } from "../../src/generated";
import { encodeUtf8 } from "../../src/wire/bytes";

const FIXTURES_DIR = path.resolve(__dirname, "../../idl/v1/fixtures");

describe("generated types vs fixture corpus", () => {
  it("every command's request fixture carries the catalog wire type", () => {
    let checked = 0;
    for (const id of COMMAND_IDS) {
      const entry = COMMANDS[id];
      if (!entry.requestFixture) continue;
      const fixturePath = path.join(FIXTURES_DIR, entry.requestFixture);
      expect(fs.existsSync(fixturePath), `${id}: ${entry.requestFixture}`).toBe(true);
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { type?: string };
      expect(fixture.type, id).toBe(entry.wireType);
      checked++;
    }
    // The corpus must actually cover the catalog, not trivially pass.
    expect(checked).toBeGreaterThan(100);
  });

  it("request interfaces enforce the byte boundary at compile time", () => {
    const request: KvGetRequest = {
      type: "kv_get",
      key: encodeUtf8("greeting"),
      branch: "main",
    };
    expect(request.key).toBe("Z3JlZXRpbmc=");

    // @ts-expect-error — a plain string is not WireBase64; hand-encoded keys do not typecheck (AR-1.7)
    const rejected: KvGetRequest = { type: "kv_get", key: "greeting" };
    void rejected;

    // @ts-expect-error — the wire discriminator is a literal, not any string
    const wrongTag: KvGetRequest = { type: "kv_put", key: encodeUtf8("x") };
    void wrongTag;
  });
});
