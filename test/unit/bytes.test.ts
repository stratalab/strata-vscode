import { describe, expect, it } from "vitest";
import { asWireBase64, decodeBytes, encodeBytes, encodeUtf8 } from "../../src/wire/bytes";

describe("wire byte boundary", () => {
  it("round-trips arbitrary bytes", () => {
    const data = new Uint8Array([0, 1, 2, 255, 254, 128, 64]);
    expect(decodeBytes(encodeBytes(data))).toEqual(data);
  });

  it("encodes UTF-8 text the way the wire examples show", () => {
    // Appendix A: {"type": "kv_get", "key": "aGk="} is the key "hi"
    expect(encodeUtf8("hi")).toBe("aGk=");
  });

  it("accepts canonical base64 and rejects everything else", () => {
    expect(asWireBase64("aGk=")).toBe("aGk=");
    expect(asWireBase64("")).toBe("");
    expect(() => asWireBase64("not base64!")).toThrow();
    expect(() => asWireBase64("aGk")).toThrow(); // missing padding
    expect(() => asWireBase64("aGk_")).toThrow(); // url-safe alphabet is not the wire encoding
  });
});
