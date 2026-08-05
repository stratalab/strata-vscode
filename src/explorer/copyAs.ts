/**
 * "Copy as" affordances (F1.3): every inspected item can be reproduced as
 * wire JSON, and as a CLI command when one exists (`path_display`/cliDisplay
 * from the catalog; wire-only commands have none). CLI examples show plain
 * text; the wire shows base64 — the catalog owns that boundary (AR-1.7).
 */
import { COMMANDS, type ReadCommandId } from "../generated";

export interface CopyContext {
  branch: string;
  space?: string;
}

/** The wire request that reproduces this read, as pretty JSON. */
export function copyAsWireJson(
  commandId: ReadCommandId,
  payload: Record<string, unknown>,
  context: CopyContext,
): string {
  const entry = COMMANDS[commandId];
  return JSON.stringify(
    {
      id: 1,
      branch: context.branch,
      ...(context.space !== undefined ? { space: context.space } : {}),
      command: { type: entry.wireType, ...payload },
    },
    null,
    2,
  );
}

/**
 * The CLI invocation for the same read, or null when the command is
 * wire-only or an argument has no plain-text form.
 */
export function copyAsCli(
  commandId: ReadCommandId,
  positionals: Array<string | null>,
  context: CopyContext,
): string | null {
  const entry = COMMANDS[commandId];
  if (!entry.cliDisplay) return null;
  if (positionals.some((arg) => arg === null)) return null; // non-text bytes have no CLI form
  const args = positionals.map((arg) => shellQuote(arg!));
  const scope: string[] = [];
  if (context.branch !== "default") scope.push("--branch", shellQuote(context.branch));
  if (context.space !== undefined && context.space !== "default") {
    scope.push("--space", shellQuote(context.space));
  }
  return [entry.cliDisplay, ...args, ...scope].join(" ");
}

function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
