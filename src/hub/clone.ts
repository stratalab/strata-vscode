/**
 * Clone from StrataHub (F5): a wrapper over `strata clone`, which uses its
 * own ephemeral executor — never an attached session (`hub_clone` is
 * write-classified on the wire, and the owner's read gate would rightly
 * refuse it). Errors map by registry code with their hints (F5.3, N3).
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { cliErrorFromEnvelope, firstCliJsonObject, isRecord, outputSnippet } from "../cli/envelope";

export interface CloneRequest {
  dataset: string;
  dest: string;
  branch?: string;
  /** Overrides env and config resolution (`--hub`, F5.1). */
  hubUrl?: string;
}

export type CloneProgressStage =
  | "resolved"
  | "manifest_fetched"
  | "object_fetched"
  | "importing"
  | "done"
  | "unknown";

export interface CloneProgressEvent {
  stage: CloneProgressStage;
  dataset: string;
  branch: string | null;
  manifestHash: string | null;
  objectCount: number | null;
  totalBytes: number | null;
  index: number | null;
  bytes: number | null;
}

export interface CloneRunOptions {
  /** Enable `strata clone --progress jsonl` when the installed CLI supports it. */
  progress?: boolean;
  onProgress?: (event: CloneProgressEvent) => void;
}

export interface CloneError {
  class: string;
  code: string;
  message: string;
  suggestedFix: string | null;
  docsUrl: string | null;
  retryable: boolean;
}

export type CloneResult =
  | { ok: true; report: unknown }
  | { ok: false; error: CloneError };

const CLONE_TIMEOUT_MS = 120_000;
const CAPTURE_LIMIT = 1_000_000;

export async function runClone(
  binary: string,
  request: CloneRequest,
  options: CloneRunOptions = {},
): Promise<CloneResult> {
  // Destination collisions are a local fact — refuse before spawning.
  if (fs.existsSync(request.dest)) {
    return {
      ok: false,
      error: {
        class: "failed_precondition",
        code: "failed_precondition.executor.hub_clone",
        message: `destination already exists: ${request.dest}`,
        suggestedFix: "Pick an empty destination directory.",
        docsUrl: "https://stratadb.org/e/failed_precondition.executor.hub_clone",
        retryable: false,
      },
    };
  }

  const args = ["clone", request.dataset, request.dest, "--json"];
  if (options.progress) args.push("--progress", "jsonl");
  if (request.branch) args.push("--branch", request.branch);
  if (request.hubUrl) args.push("--hub", request.hubUrl);

  const { stdout, stderr, timedOut } = await runCloneProcess(binary, args, (line) => {
    const progress = cloneProgressFromLine(line);
    if (progress) options.onProgress?.(progress);
  });
  if (timedOut) {
    return {
      ok: false,
      error: {
        class: "unavailable",
        code: "client.clone_timeout",
        message: `strata clone exceeded ${Math.round(CLONE_TIMEOUT_MS / 1000)} seconds.`,
        suggestedFix: "Retry the clone, or clone from the Strata CLI for a long-running download.",
        docsUrl: null,
        retryable: true,
      },
    };
  }

  // `--progress jsonl` emits progress envelopes before the final result, so
  // scan for the first non-progress result/error envelope.
  const parsed = firstCliJsonObject(stdout, stderr, { skip: isProgressEnvelope });
  const envelopeError = cliErrorFromEnvelope(parsed);
  if (envelopeError) {
    return {
      ok: false,
      error: { ...envelopeError, message: envelopeError.message || "clone failed" },
    };
  }
  if (parsed) return { ok: true, report: parsed };
  return {
    ok: false,
    error: {
      class: "unknown",
      code: "client.clone_output_unparseable",
      message: `strata clone produced no JSON envelope: ${outputSnippet(stdout, stderr, 300)}`,
      suggestedFix: null,
      docsUrl: null,
      retryable: false,
    },
  };
}

function runCloneProcess(
  binary: string,
  args: string[],
  onLine: (line: string) => void,
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    const readStdout = lineReader(onLine);
    const readStderr = lineReader(onLine);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    }, CLONE_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = appendCapped(stdout, text);
      readStdout.push(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = appendCapped(stderr, text);
      readStderr.push(text);
    });
    child.on("error", (error) => {
      stderr = appendCapped(stderr, String(error));
    });
    child.on("close", () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      readStdout.flush();
      readStderr.flush();
      resolve({ stdout, stderr, timedOut });
    });
  });
}

function lineReader(onLine: (line: string) => void): { push(text: string): void; flush(): void } {
  let pending = "";
  return {
    push(text: string): void {
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    },
    flush(): void {
      if (pending) onLine(pending);
      pending = "";
    },
  };
}

function appendCapped(existing: string, next: string): string {
  const joined = existing + next;
  return joined.length > CAPTURE_LIMIT ? joined.slice(joined.length - CAPTURE_LIMIT) : joined;
}

function cloneProgressFromLine(line: string): CloneProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (!isProgressEnvelope(value)) return null;
    return cloneProgressFromRaw((value as { data: Record<string, unknown> }).data);
  } catch {
    return null;
  }
}

function isProgressEnvelope(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const raw = value;
  return raw.type === "hub_clone_progress" && raw.data !== null && typeof raw.data === "object";
}

function cloneProgressFromRaw(raw: Record<string, unknown>): CloneProgressEvent {
  return {
    stage: cloneProgressStage(raw.stage),
    dataset: stringField(raw, "dataset") ?? "unknown",
    branch: stringField(raw, "branch"),
    manifestHash: stringField(raw, "manifest_hash"),
    objectCount: numberField(raw, "object_count"),
    totalBytes: numberField(raw, "total_bytes"),
    index: numberField(raw, "index"),
    bytes: numberField(raw, "bytes"),
  };
}

function cloneProgressStage(value: unknown): CloneProgressStage {
  return value === "resolved" ||
    value === "manifest_fetched" ||
    value === "object_fetched" ||
    value === "importing" ||
    value === "done" ||
    value === "unknown"
    ? value
    : "unknown";
}

function stringField(raw: Record<string, unknown>, key: string): string | null {
  return typeof raw[key] === "string" ? raw[key] : null;
}

function numberField(raw: Record<string, unknown>, key: string): number | null {
  return typeof raw[key] === "number" && Number.isFinite(raw[key]) ? raw[key] : null;
}
