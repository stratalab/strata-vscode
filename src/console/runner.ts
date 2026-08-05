/**
 * Console execution (F3.3–F3.5): builds the wire command from the active
 * view context, classifies expense (F3.4 confirmation is the caller's job —
 * this module only says when one is needed), runs through the interactive
 * client (the write gate lives there, AR-4.2), and renders results and error
 * envelopes to document content.
 */
import { COMMANDS, COMMAND_FORMS, ERROR_REGISTRY, type CommandId } from "../generated";
import type { InteractiveClient } from "../wire/client";
import { classifyCommand, DEFAULT_BUDGETS } from "../wire/client";
import { CommandFailedError } from "../wire/errors";
import type { ResponsePayload } from "../wire/protocol";

export interface ConsoleContext {
  branch: string;
  space?: string;
  /** Scrub position; injected only into commands whose schema takes as_of (F2.2). */
  asOfMicros?: number | null;
}

export interface ConsoleRun {
  commandId: CommandId;
  wireCommand: Record<string, unknown>;
  deadlineMs: number;
  /** True for read.analytics / read.search / arrow kinds — needs the F3.4 confirmation. */
  needsConfirmation: boolean;
}

export function planRun(
  commandId: CommandId,
  payload: Record<string, unknown>,
  context: ConsoleContext,
  expensiveDeadlineMs = DEFAULT_BUDGETS.expensive,
): ConsoleRun {
  const entry = COMMANDS[commandId];
  const requestClass = classifyCommand(entry);
  const wireCommand: Record<string, unknown> = { type: entry.wireType, ...payload };
  if (
    context.asOfMicros != null &&
    wireCommand.as_of === undefined &&
    commandTakesAsOf(commandId)
  ) {
    wireCommand.as_of = context.asOfMicros;
  }
  return {
    commandId,
    wireCommand,
    deadlineMs: requestClass === "expensive" ? expensiveDeadlineMs : DEFAULT_BUDGETS[requestClass],
    needsConfirmation: requestClass === "expensive",
  };
}

export function commandTakesAsOf(commandId: CommandId): boolean {
  return COMMAND_FORMS[commandId].takesAsOf;
}

export async function executeRun(
  client: InteractiveClient,
  run: ConsoleRun,
  context: ConsoleContext,
): Promise<ResponsePayload> {
  return client.requestRaw(run.wireCommand, {
    branch: context.branch,
    ...(context.space !== undefined ? { space: context.space } : {}),
    deadlineMs: run.deadlineMs,
  });
}

/**
 * Cursor continuation (F3.3): the follow-up payload for the next page, or
 * null when the response is not a continuable page. KV scans resume via
 * `start`; everything else uses `cursor`.
 */
export function continuationPayload(
  commandId: CommandId,
  sentPayload: Record<string, unknown>,
  responsePayload: ResponsePayload,
): Record<string, unknown> | null {
  if (!("type" in responsePayload)) return null;
  const data = (responsePayload as { data?: { cursor?: unknown; has_more?: boolean } }).data;
  if (!data || data.has_more !== true || data.cursor == null) return null;
  const fieldNames = new Set(COMMAND_FORMS[commandId].fields.map((f) => f.name));
  if (fieldNames.has("cursor")) return { ...sentPayload, cursor: data.cursor };
  if (fieldNames.has("start")) return { ...sentPayload, start: data.cursor };
  if (fieldNames.has("after_sequence")) return { ...sentPayload, after_sequence: data.cursor };
  return null;
}

/** Result document content (F3.3): the payload plus reproduction facts. */
export function renderResult(run: ConsoleRun, context: ConsoleContext, payload: ResponsePayload): string {
  return JSON.stringify(
    {
      command: run.commandId,
      branch: context.branch,
      ...(context.asOfMicros != null ? { as_of: context.asOfMicros } : {}),
      request: run.wireCommand,
      response: payload,
    },
    null,
    2,
  );
}

/** Error document content (F3.5): the full envelope plus the docs link. */
export function renderError(run: ConsoleRun, error: unknown): string {
  if (error instanceof CommandFailedError) {
    const registered = ERROR_REGISTRY[error.code];
    return JSON.stringify(
      {
        command: run.commandId,
        request: run.wireCommand,
        error: {
          class: error.errorClass,
          code: error.code,
          message: error.message,
          retry_policy: error.retryPolicy ?? null,
          commit_outcome: error.commitOutcome ?? null,
          docs: registered?.docsUrl ?? `https://stratadb.org/e/${error.code}`,
        },
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    { command: run.commandId, error: { message: error instanceof Error ? error.message : String(error) } },
    null,
    2,
  );
}
