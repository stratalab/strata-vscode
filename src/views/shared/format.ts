/**
 * Time and number typesetting (U3, XC-4/XC-5): one voice for every
 * timestamp and count in the product. Vscode-free and DOM-free — imported
 * by the webviews, the tree, and the quick-input flows alike.
 *
 * The contract: display text is humanized (relative under 24h, short
 * absolute with the year otherwise); full microsecond precision is never
 * lost — it rides on hover titles and in copies via `exactMicros`.
 */

const counts = new Intl.NumberFormat("en-US");
const absolutes = new Map<string, Intl.DateTimeFormat>();

function absoluteFormatter(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone ?? "local";
  let formatter = absolutes.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    absolutes.set(key, formatter);
  }
  return formatter;
}

export interface TimeFormatOptions {
  /** Test seam; defaults to the wall clock. */
  nowMs?: number;
  /** Test seam; defaults to the local zone (what a developer thinks in). */
  timeZone?: string;
}

/** Short absolute form, always with the year: "Aug 5, 2026, 14:12:00". */
export function formatMicrosAbsolute(micros: number, options: TimeFormatOptions = {}): string {
  return absoluteFormatter(options.timeZone).format(new Date(Math.floor(micros / 1000)));
}

/**
 * The display form: relative under 24h ("2m ago"), absolute beyond it.
 * Future timestamps render absolute — "in 3m" is never honest about clock
 * skew, and the exact form is one hover away.
 */
export function formatMicros(micros: number, options: TimeFormatOptions = {}): string {
  const ms = Math.floor(micros / 1000);
  const diff = (options.nowMs ?? Date.now()) - ms;
  if (diff >= 0 && diff < 60_000) return "just now";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return formatMicrosAbsolute(micros, options);
}

/** Full-precision UTC ISO with microseconds: "2026-08-05T14:12:00.123456Z". */
export function exactMicros(micros: number): string {
  const ms = Math.floor(micros / 1000);
  const rem = String(Math.abs(micros % 1000)).padStart(3, "0");
  return new Date(ms).toISOString().replace("Z", `${rem}Z`);
}

/** Thousands-separated integer: 48213 → "48,213". */
export function formatCount(n: number): string {
  return counts.format(n);
}

/** Humanized size: 16 → "16 B", 12_345 → "12.1 KB". Exact count on hover. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? String(Math.round(value)) : value.toFixed(1)} ${units[unit]}`;
}
