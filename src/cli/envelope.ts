export interface CliEnvelopeError {
  class: string;
  code: string;
  message: string;
  suggestedFix: string | null;
  docsUrl: string | null;
  retryable: boolean;
}

export interface JsonLineOptions {
  skip?: (value: Record<string, unknown>) => boolean;
}

export function firstCliJsonObject(
  stdout: string,
  stderr = "",
  options: JsonLineOptions = {},
): Record<string, unknown> | null {
  return firstJsonObject(stdout, options) ?? firstJsonObject(stderr, options);
}

export function firstJsonObject(
  text: string,
  options: JsonLineOptions = {},
): Record<string, unknown> | null {
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseJsonObject(line.trim());
    if (!parsed || options.skip?.(parsed)) continue;
    return parsed;
  }
  return null;
}

export function cliErrorFromEnvelope(parsed: unknown): CliEnvelopeError | null {
  if (!isRecord(parsed) || !isRecord(parsed.error)) return null;
  const raw = parsed.error;
  return {
    class: stringField(raw, "class") ?? "unknown",
    code: stringField(raw, "code") ?? "unknown",
    message: stringField(raw, "message") ?? "strata command failed",
    suggestedFix: stringField(raw, "suggested_fix") ?? firstString(raw.hints) ?? stringField(raw, "hint"),
    docsUrl: stringField(raw, "docs_url") ?? stringField(raw, "ref"),
    retryable: raw.retryable === true,
  };
}

export function outputSnippet(stdout: string, stderr: string, maxLength: number): string {
  return (stderr || stdout).trim().slice(0, maxLength);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.startsWith("{")) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}
