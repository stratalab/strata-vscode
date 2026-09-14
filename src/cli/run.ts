import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { cliErrorFromEnvelope, firstCliJsonObject, outputSnippet } from "./envelope";

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

  const parsed = firstCliJsonObject(stdout, stderr);
  const envelopeError = cliErrorFromEnvelope(parsed);
  if (envelopeError) {
    throw new StrataCliCommandError({
      errorClass: envelopeError.class,
      code: envelopeError.code,
      message: envelopeError.message,
      suggestedFix: envelopeError.suggestedFix,
      docsUrl: envelopeError.docsUrl,
      retryable: envelopeError.retryable,
    });
  }

  if (error) {
    const detail = outputSnippet(stdout, stderr, 1_000) || error.message;
    throw new Error(detail);
  }
  if (parsed === null) {
    throw new Error(outputSnippet(stdout, stderr, 1_000) || "strata did not emit JSON");
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
