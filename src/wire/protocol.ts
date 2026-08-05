/**
 * IPC protocol-revision-2 frame shapes (Appendix A; verified against
 * strata-core crates/executor/src/ipc/protocol.rs at the pinned rev).
 */

export const PROTOCOL_VERSION = 2;
export const CAPABILITY_NOTIFY_VERSION = "notify.version";
export const EVENT_VERSION = "version";
/** The owner's notify poll interval — the tick latency bound (§3.1). */
export const NOTIFY_LATENCY_BOUND_MS = 150;
/** The owner's connection cap; past it, connects get a typed refusal. */
export const OWNER_CONNECTION_CAP = 128;

export type SessionAccess = "read" | "read_write";

export interface IdlStamps {
  schema_version: string;
  generator_version: string;
}

export interface ClientIdentity {
  name: string;
  version?: string;
  pid?: number;
}

/** The client's first frame. deny_unknown_fields upstream — send exactly this. */
export interface HelloFrame {
  hello: {
    protocol: number;
    idl?: IdlStamps;
    client?: ClientIdentity;
    access?: SessionAccess;
    capabilities?: string[];
  };
}

/** The owner's hello reply — a bare `{type, data}` envelope, no id wrapper. */
export interface ServerHello {
  protocol: number;
  release: string;
  idl: IdlStamps;
  granted_access: SessionAccess;
  capabilities: string[];
  owner_pid: number;
}

/** Request envelope: correlation id + session scope + the raw wire command. */
export interface RequestEnvelope {
  id: number;
  deadline_ms?: number;
  branch?: string;
  space?: string;
  command: Record<string, unknown>;
}

/** The executor error envelope carried inside a response payload. */
export interface WireErrorEnvelope {
  class: string;
  code: string;
  message?: string;
  retry_policy?: string;
  commit_outcome?: string;
  [extra: string]: unknown;
}

/** A response payload: an executor `{type, data}` envelope or an error. */
export type ResponsePayload =
  | { type: string; data?: unknown; [extra: string]: unknown }
  | { error: WireErrorEnvelope };

/** A correlated protocol-revision-2 response frame. */
export interface ResponseFrame {
  id: number | null;
  payload: ResponsePayload;
}

export interface SubscribeFrame {
  id: number;
  subscribe: { events: string[] };
}

/** A push: `{"notify": {"event": "version", "version": N}}` — no id. */
export interface NotifyFrame {
  notify: { event: string; version?: number; [extra: string]: unknown };
}

export function isNotifyFrame(frame: unknown): frame is NotifyFrame {
  return (
    typeof frame === "object" &&
    frame !== null &&
    typeof (frame as NotifyFrame).notify === "object" &&
    (frame as NotifyFrame).notify !== null
  );
}

export function isResponseFrame(frame: unknown): frame is ResponseFrame {
  return (
    typeof frame === "object" &&
    frame !== null &&
    "payload" in frame &&
    typeof (frame as ResponseFrame).payload === "object"
  );
}

export function payloadError(payload: ResponsePayload): WireErrorEnvelope | null {
  if ("error" in payload) {
    const envelope = (payload as { error?: WireErrorEnvelope }).error;
    return envelope ?? null;
  }
  return null;
}
