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
import { formatCount, formatLogicalTimestamp, formatMicros } from "../views/shared/format";

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

export function renderResultReport(run: ConsoleRun, context: ConsoleContext, payload: ResponsePayload): string {
  const sections = [
    `# ${run.commandId} result`,
    metadataTable(run, context, payload),
    summarySection(payload),
    "## Raw JSON",
    fencedJson(resultEnvelope(run, context, payload)),
  ];
  return sections.filter(Boolean).join("\n\n");
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

export function renderErrorReport(run: ConsoleRun, error: unknown): string {
  const rendered = JSON.parse(renderError(run, error)) as Record<string, unknown>;
  const rawError = isRecord(rendered.error) ? rendered.error : {};
  const rows: Array<[string, string]> = [
    ["Command", run.commandId],
    ["Code", preview(rawError.code)],
    ["Class", preview(rawError.class)],
    ["Message", preview(rawError.message)],
  ];
  if (rawError.retry_policy !== undefined) rows.push(["Retry policy", preview(rawError.retry_policy)]);
  if (rawError.commit_outcome !== undefined) rows.push(["Commit outcome", preview(rawError.commit_outcome)]);
  if (typeof rawError.docs === "string") rows.push(["Docs", rawError.docs]);

  return [
    `# ${run.commandId} error`,
    table(["Field", "Value"], rows),
    "## Raw JSON",
    fencedJson(rendered),
  ].join("\n\n");
}

function resultEnvelope(run: ConsoleRun, context: ConsoleContext, payload: ResponsePayload): Record<string, unknown> {
  return {
    command: run.commandId,
    branch: context.branch,
    ...(context.asOfMicros != null ? { as_of: context.asOfMicros } : {}),
    request: run.wireCommand,
    response: payload,
  };
}

function metadataTable(run: ConsoleRun, context: ConsoleContext, payload: ResponsePayload): string {
  const rows: Array<[string, string]> = [
    ["Command", run.commandId],
    ["Branch", context.branch],
    ["Response", "type" in payload ? payload.type : "error"],
  ];
  if (context.space) rows.push(["Space", context.space]);
  if (context.asOfMicros != null) rows.push(["As of", formatLogicalTimestamp(context.asOfMicros)]);
  return table(["Field", "Value"], rows);
}

function summarySection(payload: ResponsePayload): string {
  if (!("type" in payload)) return errorSummary(payload.error);
  const data = payload.data;
  if (isRecord(data)) {
    const commit = findCommit(data);
    const effect = findEffect(data);
    if (commit || effect) return writeReceiptSummary(data, commit, effect);
    if (Array.isArray(data.items)) return pageSummary(data);
    if (isBranchComparison(data)) return branchComparisonSummary(data);
    return objectSummary(data);
  }
  if (Array.isArray(data)) return arraySummary(data);
  return scalarSummary(data);
}

function errorSummary(error: unknown): string {
  if (!isRecord(error)) return `## Summary\n\n${preview(error)}`;
  return [
    "## Summary",
    table(
      ["Field", "Value"],
      [
        ["Code", preview(error.code)],
        ["Message", preview(error.message)],
      ],
    ),
  ].join("\n\n");
}

function writeReceiptSummary(
  data: Record<string, unknown>,
  commit: Record<string, unknown> | null,
  effect: Record<string, unknown> | null,
): string {
  const rows: Array<[string, string]> = [];
  if (effect) {
    rows.push(["Effect", preview(effect.kind)]);
    if (effect.changed !== undefined) rows.push(["Changed", preview(effect.changed)]);
  }
  if (commit) {
    rows.push(["Version", preview(commit.version)]);
    rows.push(["Timestamp", typeof commit.timestamp === "number" ? formatLogicalTimestamp(commit.timestamp) : preview(commit.timestamp)]);
    if (typeof commit.committed_at === "number") rows.push(["Committed", formatMicros(commit.committed_at)]);
    rows.push(["Puts", preview(commit.put_count)]);
    rows.push(["Deletes", preview(commit.delete_count)]);
    rows.push(["Durability", preview(commit.durability)]);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === "commit" || key === "effect") continue;
    if (isSimple(value)) rows.push([humanizeKey(key), preview(value)]);
  }
  return ["## Write Receipt", table(["Field", "Value"], rows.length ? rows : [["Result", "Completed"]])].join("\n\n");
}

function pageSummary(data: Record<string, unknown>): string {
  const items = data.items as unknown[];
  const rows = items.slice(0, 12).map((item, index) => itemRow(index, item));
  const facts: Array<[string, string]> = [
    ["Loaded", `${formatCount(items.length)} ${items.length === 1 ? "item" : "items"}`],
    ["More", data.has_more === true ? "yes" : "no"],
  ];
  if (data.cursor != null) facts.push(["Cursor", preview(data.cursor)]);
  return [
    "## Page",
    table(["Field", "Value"], facts),
    rows.length > 0 ? table(["#", "Item"], rows) : "No rows returned.",
  ].join("\n\n");
}

function arraySummary(data: unknown[]): string {
  return [
    "## Results",
    table([`${formatCount(data.length)} ${data.length === 1 ? "item" : "items"}`, "Value"], data.slice(0, 12).map((item, index) => [String(index + 1), preview(item)])),
  ].join("\n\n");
}

function branchComparisonSummary(data: Record<string, unknown>): string {
  const spaces = Array.isArray(data.spaces) ? data.spaces.filter(isRecord) : [];
  const rows = spaces.map((space) => [
    preview(space.space ?? space.name),
    preview(space.capability),
    preview(space.added),
    preview(space.modified),
    preview(space.removed),
  ]);
  return [
    "## Branch Diff",
    table(
      ["Field", "Value"],
      [
        ["From", preview(data.branch_a)],
        ["To", preview(data.branch_b)],
        ["Groups", formatCount(spaces.length)],
      ],
    ),
    rows.length > 0 ? table(["Space", "Capability", "Added", "Modified", "Removed"], rows) : "No differences returned.",
  ].join("\n\n");
}

function objectSummary(data: Record<string, unknown>): string {
  const scalarRows = Object.entries(data)
    .filter(([, value]) => isSimple(value))
    .slice(0, 20)
    .map(([key, value]) => [humanizeKey(key), preview(value)] as [string, string]);
  const nestedRows = Object.entries(data)
    .filter(([, value]) => !isSimple(value))
    .slice(0, 10)
    .map(([key, value]) => [humanizeKey(key), nestedSummary(value)] as [string, string]);
  const rows = [...scalarRows, ...nestedRows];
  return ["## Summary", rows.length > 0 ? table(["Field", "Value"], rows) : "No fields returned."].join("\n\n");
}

function scalarSummary(data: unknown): string {
  return ["## Value", table(["Type", "Value"], [[typeof data, preview(data)]])].join("\n\n");
}

function itemRow(index: number, item: unknown): [string, string] {
  if (!isRecord(item)) return [String(index + 1), preview(item)];
  const preferred = ["key", "id", "name", "version", "timestamp", "sequence", "event_type", "status"];
  const parts = preferred
    .filter((key) => item[key] !== undefined)
    .map((key) => `${humanizeKey(key)}: ${preview(item[key])}`);
  return [String(index + 1), parts.length > 0 ? parts.join(", ") : preview(item)];
}

function findCommit(data: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(data.commit)) return data.commit;
  for (const value of Object.values(data)) {
    if (isRecord(value) && isRecord(value.commit)) return value.commit;
  }
  return null;
}

function findEffect(data: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(data.effect)) return data.effect;
  for (const value of Object.values(data)) {
    if (isRecord(value) && isRecord(value.effect)) return value.effect;
  }
  return null;
}

function isBranchComparison(data: Record<string, unknown>): boolean {
  return typeof data.branch_a === "string" && typeof data.branch_b === "string" && Array.isArray(data.spaces);
}

function isSimple(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function nestedSummary(value: unknown): string {
  if (Array.isArray(value)) return `${formatCount(value.length)} ${value.length === 1 ? "item" : "items"}`;
  if (isRecord(value)) return `${formatCount(Object.keys(value).length)} ${Object.keys(value).length === 1 ? "field" : "fields"}`;
  return preview(value);
}

function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.map(escapeTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
  ].join("\n");
}

function preview(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 96 ? `${value.slice(0, 93)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const rendered = JSON.stringify(value);
  return rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered;
}

function fencedJson(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2).replace(/```/g, "`\\`\\`")}\n\`\`\``;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
