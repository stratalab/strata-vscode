/**
 * The row inspector (F1.2): a lightweight, native (webview-less) rendering of
 * one record — decoded value forms, versions, and the facts needed for the
 * F1.3 copy affordances. Pure content generation; the extension layer shows
 * it as a read-only JSON document.
 */
import type { InteractiveClient } from "../wire/client";
import type { WireBase64 } from "../wire/bytes";
import { decodeValue, keyText } from "./decode";
import type { Scope } from "./model";

export interface Inspection {
  title: string;
  /** Pretty-printed JSON document content. */
  content: string;
}

function scopeFacts(scope: Scope): Record<string, string> {
  return { database: scope.dbPath, branch: scope.branch, space: scope.space };
}

export async function inspectKv(
  client: InteractiveClient,
  scope: Scope,
  key: WireBase64,
): Promise<Inspection> {
  const context = { branch: scope.branch, space: scope.space };
  const response = await client.request(
    "kv.get",
    { key, branch: scope.branch, space: scope.space },
    context,
  );
  const record = response.data;
  const body: Record<string, unknown> = {
    ...scopeFacts(scope),
    key: { text: keyText(key), base64: key },
    found: record.found,
  };
  if (record.found && record.value) {
    const decoded = decodeValue(record.value.value);
    body.version = record.value.version;
    body.timestamp = record.value.timestamp;
    body.value = {
      form: decoded.form,
      byteLength: decoded.byteLength,
      display: decoded.form === "json" ? JSON.parse(decoded.display) : decoded.display,
      base64: record.value.value,
    };
  }
  return { title: `kv: ${keyText(key) ?? key}`, content: JSON.stringify(body, null, 2) };
}

export async function inspectJson(
  client: InteractiveClient,
  scope: Scope,
  docId: string,
): Promise<Inspection> {
  const context = { branch: scope.branch, space: scope.space };
  const response = await client.request(
    "json.get",
    { key: docId, path: "$", branch: scope.branch, space: scope.space },
    context,
  );
  const body = {
    ...scopeFacts(scope),
    document: docId,
    found: response.data.found,
    value: response.data.value,
  };
  return { title: `json: ${docId}`, content: JSON.stringify(body, null, 2) };
}

export function inspectEvent(
  scope: Scope,
  event: { eventType: string; version: number; timestamp: number },
  raw?: unknown,
): Inspection {
  const body = { ...scopeFacts(scope), ...event, record: raw };
  return {
    title: `event: ${event.eventType} v${event.version}`,
    content: JSON.stringify(body, null, 2),
  };
}
