import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

export interface StrataCliErrorDetails {
  errorClass: string;
  code: string;
  message: string;
  suggestedFix: string | null;
  docsUrl: string | null;
  retryable: boolean;
}

export class StrataCliCommandError extends Error {
  constructor(readonly details: StrataCliErrorDetails) {
    super(details.message);
  }
}

export async function runStrataJson(
  binary: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const { stdout, stderr, error } = await new Promise<{
    stdout: string;
    stderr: string;
    error: Error | null;
  }>((resolve) => {
    execFile(
      binary,
      args,
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => resolve({ stdout, stderr, error }),
    );
  });

  const parsed = firstJson(stdout) ?? firstJson(stderr);
  const envelopeError = errorFromEnvelope(parsed);
  if (envelopeError) throw new StrataCliCommandError(envelopeError);

  if (error) {
    const detail = (stderr || stdout).trim().slice(0, 1_000) || error.message;
    throw new Error(detail);
  }
  if (parsed === null) {
    throw new Error((stderr || stdout).trim().slice(0, 1_000) || "strata did not emit JSON");
  }
  return parsed;
}

export async function runStrataCommandJson(
  binary: string,
  dbPath: string,
  command: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strata-vscode-"));
  const commandFile = path.join(tempDir, "command.json");
  try {
    await fs.writeFile(commandFile, JSON.stringify(command), "utf8");
    return await runStrataJson(
      binary,
      ["--db", dbPath, "--json", "command", "run", "--file", commandFile],
      timeoutMs,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function firstJson(text: string): unknown | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // Keep scanning: progress logs or diagnostics may precede valid JSON.
    }
  }
  return null;
}

function errorFromEnvelope(parsed: unknown): StrataCliErrorDetails | null {
  if (!isRecord(parsed) || !isRecord(parsed.error)) return null;
  const raw = parsed.error;
  return {
    errorClass: stringField(raw, "class") ?? "unknown",
    code: stringField(raw, "code") ?? "unknown",
    message: stringField(raw, "message") ?? "strata command failed",
    suggestedFix: stringField(raw, "suggested_fix") ?? stringField(raw, "hint"),
    docsUrl: stringField(raw, "docs_url") ?? stringField(raw, "ref"),
    retryable: raw.retryable === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}
