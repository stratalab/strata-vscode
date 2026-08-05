/**
 * Clone from StrataHub (F5): a wrapper over `strata clone`, which uses its
 * own ephemeral executor — never an attached session (`hub_clone` is
 * write-classified on the wire, and the owner's read gate would rightly
 * refuse it). Errors map by registry code with their hints (F5.3, N3).
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";

export interface CloneRequest {
  dataset: string;
  dest: string;
  branch?: string;
  /** Overrides env and config resolution (`--hub`, F5.1). */
  hubUrl?: string;
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

export async function runClone(binary: string, request: CloneRequest): Promise<CloneResult> {
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
  if (request.branch) args.push("--branch", request.branch);
  if (request.hubUrl) args.push("--hub", request.hubUrl);

  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve) => {
    execFile(binary, args, { timeout: CLONE_TIMEOUT_MS }, (_error, stdout, stderr) =>
      resolve({ stdout, stderr }),
    );
  });

  // `--json` puts the envelope (result or error) on stdout; map by code (N3).
  const parsed = firstJson(stdout) ?? firstJson(stderr);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const raw = (parsed as { error: Record<string, unknown> }).error;
    return {
      ok: false,
      error: {
        class: String(raw.class ?? "unknown"),
        code: String(raw.code ?? "unknown"),
        message: String(raw.message ?? "clone failed"),
        suggestedFix: typeof raw.suggested_fix === "string" ? raw.suggested_fix : null,
        docsUrl: typeof raw.docs_url === "string" ? raw.docs_url : null,
        retryable: raw.retryable === true,
      },
    };
  }
  if (parsed) return { ok: true, report: parsed };
  return {
    ok: false,
    error: {
      class: "unknown",
      code: "client.clone_output_unparseable",
      message: `strata clone produced no JSON envelope: ${(stderr || stdout).trim().slice(0, 300)}`,
      suggestedFix: null,
      docsUrl: null,
      retryable: false,
    },
  };
}

function firstJson(text: string): unknown | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep scanning
    }
  }
  return null;
}
