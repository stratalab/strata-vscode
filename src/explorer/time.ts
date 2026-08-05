/**
 * Timestamp parsing for the scrubber input (F2.2) — vscode-free.
 */
/** Accepts ISO datetimes and unix seconds/millis/micros; returns microseconds. */
export function parseTimestampMicros(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (value < 1e11) return value * 1_000_000; // seconds
    if (value < 1e14) return value * 1_000; // millis
    return value; // already micros
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed * 1_000;
}
