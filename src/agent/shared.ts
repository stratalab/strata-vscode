import type { InferenceDocCommand, StarterLanguage } from "./helpers";

export interface AgentDatabaseTarget {
  dbPath: string;
  name: string;
  stateKind: string;
  stateDescription: string;
  connected: boolean;
  managed: boolean;
}

export interface AgentMcpStatus {
  level: "ok" | "warn" | "bad" | "info";
  message: string;
}

export interface AgentHelperSnapshot {
  trusted: boolean;
  binaryPath: string | null;
  mcp: AgentMcpStatus;
  databases: AgentDatabaseTarget[];
  primaryDatabase: AgentDatabaseTarget | null;
}

export type AgentViewOp =
  | { op: "bootstrap" }
  | { op: "refresh" }
  | { op: "register-agents" }
  | { op: "connect-database" }
  | { op: "browse-hub" }
  | { op: "open-status" }
  | { op: "copy-mcp" }
  | { op: "copy-snippet"; language: StarterLanguage }
  | { op: "open-api-docs" }
  | { op: "open-inference-docs"; commandId: InferenceDocCommand };

export interface AgentRequestMsg {
  kind: "request";
  reqId: number;
  payload: AgentViewOp;
}

export type AgentToExt = AgentRequestMsg | { kind: "ready" };

export type ExtToAgent =
  | { kind: "response"; reqId: number; ok: true; data: unknown }
  | { kind: "response"; reqId: number; ok: false; error: string }
  | { kind: "event"; event: "snapshot"; data: AgentHelperSnapshot };
