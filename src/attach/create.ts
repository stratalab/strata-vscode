/**
 * Local database creation wrapper. Strata creates an empty durable layout when
 * `info` opens a missing durable path, so this avoids writing user records.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { classifyLayout } from "./discovery";
import { normalizeDatabasePath } from "./manager";
import { cliErrorFromEnvelope, firstCliJsonObject, outputSnippet } from "../cli/envelope";

const CREATE_TIMEOUT_MS = 30_000;

export interface CreateDatabaseError {
  class: string;
  code: string;
  message: string;
  suggestedFix: string | null;
  docsUrl: string | null;
  retryable: boolean;
}

export type CreateDatabaseResult =
  | { ok: true; dbPath: string; report: unknown }
  | { ok: false; dbPath: string; error: CreateDatabaseError };

export type CreateTargetCheck =
  | { ok: true; dbPath: string }
  | { ok: false; dbPath: string; error: CreateDatabaseError };

export function validateCreateTarget(dbPath: string): CreateTargetCheck {
  if (dbPath.trim() === "") {
    return blocked("", "empty database path", "Pick a destination directory for the new database.");
  }
  const normalized = normalizeDatabasePath(dbPath);
  const layout = classifyLayout(normalized);
  if (layout !== "not-a-database") {
    return blocked(
      normalized,
      `destination is already a Strata database: ${normalized}`,
      "Use Connect Existing Database instead.",
    );
  }

  try {
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return blocked(normalized, `destination exists and is not a directory: ${normalized}`, "Pick a directory path.");
    }
    if (fs.readdirSync(normalized).length > 0) {
      return blocked(
        normalized,
        `destination directory is not empty: ${normalized}`,
        "Pick an empty directory or a path that does not exist yet.",
      );
    }
    return { ok: true, dbPath: normalized };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return blocked(normalized, `cannot inspect destination: ${normalized}`, null);
    }
  }

  try {
    const parent = path.dirname(normalized);
    if (!fs.statSync(parent).isDirectory()) {
      return blocked(normalized, `parent path is not a directory: ${parent}`, "Pick a destination under an existing folder.");
    }
  } catch {
    return blocked(
      normalized,
      `parent directory does not exist: ${path.dirname(normalized)}`,
      "Pick a destination under an existing folder.",
    );
  }
  return { ok: true, dbPath: normalized };
}

export async function createDurableDatabase(binary: string, dbPath: string): Promise<CreateDatabaseResult> {
  const target = validateCreateTarget(dbPath);
  if (!target.ok) return target;

  const { stdout, stderr, error } = await new Promise<{
    stdout: string;
    stderr: string;
    error: Error | null;
  }>((resolve) => {
    execFile(
      binary,
      ["--db", target.dbPath, "--json", "info"],
      { encoding: "utf8", timeout: CREATE_TIMEOUT_MS },
      (error, stdout, stderr) => resolve({ stdout, stderr, error }),
    );
  });

  const parsed = firstCliJsonObject(stdout, stderr);
  const envelopeError = errorFromEnvelope(parsed);
  if (envelopeError) return { ok: false, dbPath: target.dbPath, error: envelopeError };

  if (error) {
    const detail = outputSnippet(stdout, stderr, 300) || error.message;
    return {
      ok: false,
      dbPath: target.dbPath,
      error: {
        class: "unknown",
        code: "client.database_create_failed",
        message: detail,
        suggestedFix: null,
        docsUrl: null,
        retryable: false,
      },
    };
  }

  if (classifyLayout(target.dbPath) !== "v1") {
    return {
      ok: false,
      dbPath: target.dbPath,
      error: {
        class: "failed_precondition",
        code: "client.database_create_no_layout",
        message: `strata finished without creating a V1 database layout at ${target.dbPath}`,
        suggestedFix: "Check that strata.binaryPath points to a Strata V1 CLI.",
        docsUrl: null,
        retryable: false,
      },
    };
  }

  return { ok: true, dbPath: target.dbPath, report: parsed };
}

function blocked(dbPath: string, message: string, suggestedFix: string | null): CreateTargetCheck {
  return {
    ok: false,
    dbPath,
    error: {
      class: "failed_precondition",
      code: "failed_precondition.executor.database_create",
      message,
      suggestedFix,
      docsUrl: null,
      retryable: false,
    },
  };
}

function errorFromEnvelope(parsed: unknown): CreateDatabaseError | null {
  const error = cliErrorFromEnvelope(parsed);
  return error ? { ...error, message: error.message || "database creation failed" } : null;
}
