import type { AdminDatabaseInfo, AdminHealth, AdminIpcStatus } from "../generated";

export type StatusLevel = "ok" | "warn" | "bad" | "info";

export interface StatusFact {
  label: string;
  value: string;
  level?: StatusLevel;
}

export interface BinaryStatus {
  found: boolean;
  path: string | null;
  version: string | null;
  level: StatusLevel;
  message: string;
}

export interface TrustStatus {
  trusted: boolean;
  level: StatusLevel;
  message: string;
}

export interface WorkspaceStatus {
  name: string;
  root: string | null;
}

export interface HubStatus {
  url: string;
  source: string;
  overridden: boolean;
  warning: string | null;
  level: StatusLevel;
  message: string;
}

export interface StatusDatabase {
  dbPath: string;
  name: string;
  stateKind: string;
  stateDescription: string;
  connected: boolean;
  managed: boolean;
  disconnected: boolean;
  branch: string;
  scrubbedTo: string | null;
  health: AdminHealth | null;
  info: AdminDatabaseInfo | null;
  ipcStatus: AdminIpcStatus | null;
  error: string | null;
}

export interface McpFileStatus {
  label: string;
  file: string;
  exists: boolean;
  state: "registered" | "missing" | "stale" | "malformed" | "idle";
  managedEntries: string[];
  missingEntries: string[];
  reason: string | null;
}

export interface McpStatus {
  consent: "always" | "never" | "unset";
  nativeProvider: "available" | "unavailable" | "blocked";
  level: StatusLevel;
  message: string;
  files: McpFileStatus[];
}

export type StatusAction =
  | { op: "open-settings" }
  | { op: "manage-trust" }
  | { op: "connect-database" }
  | { op: "create-database" }
  | { op: "browse-hub" }
  | { op: "register-agents" }
  | { op: "remove-agent-registrations" }
  | { op: "open-explorer" }
  | { op: "open-file"; file: string };

export interface StatusFix {
  title: string;
  detail: string;
  level: StatusLevel;
  action: StatusAction;
}

export interface StatusCenterData {
  generatedAt: string;
  workspace: WorkspaceStatus;
  binary: BinaryStatus;
  trust: TrustStatus;
  hub: HubStatus;
  databases: StatusDatabase[];
  mcp: McpStatus;
  fixes: StatusFix[];
}

export type StatusCenterOp = { op: "bootstrap" } | { op: "refresh" } | StatusAction;

export interface StatusRequestMsg {
  kind: "request";
  reqId: number;
  payload: StatusCenterOp;
}

export type StatusToExt = StatusRequestMsg | { kind: "ready" };

export type ExtToStatus =
  | { kind: "response"; reqId: number; ok: true; data: unknown }
  | { kind: "response"; reqId: number; ok: false; error: string };
