/**
 * Time and number typesetting (U3, XC-4/XC-5): humanized display, exact
 * precision preserved, thresholds honest at their boundaries.
 */
import { describe, expect, it } from "vitest";
import {
  exactMicros,
  formatBytes,
  formatCount,
  formatHexDump,
  formatMicros,
  formatMicrosAbsolute,
} from "../../src/views/shared/format";

const T0 = Date.UTC(2026, 7, 5, 14, 12, 0); // 2026-08-05T14:12:00Z, in ms
const micros = (ms: number) => ms * 1000;

describe("formatMicros (XC-4)", () => {
  const opts = { nowMs: T0, timeZone: "UTC" };

  it("is relative under 24h and absolute beyond", () => {
    expect(formatMicros(micros(T0 - 5_000), opts)).toBe("just now");
    expect(formatMicros(micros(T0 - 59_999), opts)).toBe("just now");
    expect(formatMicros(micros(T0 - 60_000), opts)).toBe("1m ago");
    expect(formatMicros(micros(T0 - 59 * 60_000), opts)).toBe("59m ago");
    expect(formatMicros(micros(T0 - 60 * 60_000), opts)).toBe("1h ago");
    expect(formatMicros(micros(T0 - 23 * 3_600_000), opts)).toBe("23h ago");
    expect(formatMicros(micros(T0 - 24 * 3_600_000), opts)).toBe("Aug 4, 2026, 14:12:00");
  });

  it("renders future timestamps absolute — clock skew never reads as prophecy", () => {
    expect(formatMicros(micros(T0 + 90_000), opts)).toBe("Aug 5, 2026, 14:13:30");
  });

  it("always carries the year in the absolute form", () => {
    expect(formatMicrosAbsolute(micros(T0), { timeZone: "UTC" })).toBe("Aug 5, 2026, 14:12:00");
  });
});

describe("exactMicros (precision is never lost)", () => {
  it("keeps all six fractional digits", () => {
    expect(exactMicros(micros(T0) + 123_456)).toBe("2026-08-05T14:12:00.123456Z");
    expect(exactMicros(micros(T0))).toBe("2026-08-05T14:12:00.000000Z");
  });
});

describe("formatCount / formatBytes (XC-5)", () => {
  it("separates thousands", () => {
    expect(formatCount(48213)).toBe("48,213");
    expect(formatCount(7)).toBe("7");
  });

  it("humanizes sizes with sensible precision", () => {
    expect(formatBytes(16)).toBe("16 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(12_345)).toBe("12.1 KB");
    expect(formatBytes(123_456)).toBe("121 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatHexDump (KV-4)", () => {
  it("renders offset, split hex columns, and the ASCII gutter", () => {
    const hex = Buffer.from("write the report", "utf8").toString("hex");
    expect(formatHexDump(hex)).toBe(
      "00000000  77 72 69 74 65 20 74 68  65 20 72 65 70 6f 72 74  |write the report|",
    );
  });

  it("dots non-printable bytes and pads short rows", () => {
    const lines = formatHexDump("00ff41").split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("|..A|");
    expect(lines[0]!.startsWith("00000000  00 ff 41")).toBe(true);
  });

  it("offsets advance by 16 bytes per row", () => {
    const hex = "aa".repeat(20);
    const lines = formatHexDump(hex).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]!.startsWith("00000010")).toBe(true);
  });
});
