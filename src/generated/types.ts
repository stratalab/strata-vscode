// GENERATED FILE — do not edit by hand.
// Emitted by tools/generate.ts from the vendored IDL in idl/v1
// (strata-core @ idl/v1/STRATA_CORE_REV). Regenerate with `npm run generate`.

// Numeric caveat: uint64 wire fields (versions, timestamps) are emitted as
// `number`; values above 2^53 would lose precision through JSON.parse.
//
// Request DTOs are deny_unknown_fields upstream (AR-6.2): never send fields
// outside these shapes. Response handling must tolerate unknown extra fields
// on display-only paths.

import type { WireBase64 } from "../wire/bytes";

/** Binary payload encoded as standard base64 on the wire (AR-1.7). */
export type Bytes = WireBase64;

/** Capability flags in describe output. */
export interface AdminCapabilities {
  /** Arrow command surface is available. */
  arrow: boolean;
  /** Event primitive is available. */
  event: boolean;
  /** Graph core primitive is available. */
  graph_core: boolean;
  /** Inference command surface is available. */
  inference: boolean;
  /** JSON primitive is available. */
  json: boolean;
  /** KV primitive is available. */
  kv: boolean;
  /** Vector primitive is available. */
  vector: boolean;
  /** Vector index query path is available. */
  vector_index: boolean;
}

/** Sanitized config output. */
export interface AdminConfig {
  /** True when this open created a new database. */
  created: boolean;
  /** Default product branch. */
  default_branch: string;
  /** True when storage is durable. */
  durable: boolean;
  /** Open target. */
  target: AdminOpenTarget;
}

/** Control-plane status exposed in admin health outputs. */
export type AdminControlStatus = "healthy" | "missing" | "corrupt" | "unavailable";

/** Database information output. */
export interface AdminDatabaseInfo {
  /** Active branch count. */
  branch_count: number;
  /** True when this open created a new database. */
  created: boolean;
  /** Default product branch. */
  default_branch: string;
  /** True when storage is durable. */
  durable: boolean;
  /** True while the database handle is open. */
  open: boolean;
  /** Registered space count for the selected branch. */
  space_count: number;
  /** Open target. */
  target: AdminOpenTarget;
  /** Engine package version. */
  version: string;
}

/** Database describe output. */
export interface AdminDescribe {
  /** Described branch. */
  branch: string;
  /** Active branches. */
  branches: string[];
  /** Available rebuilt capabilities. */
  capabilities: AdminCapabilities;
  /** Sanitized config. */
  config: AdminConfig;
  /** Default product branch. */
  default_branch: string;
  /** Primitive summaries. */
  primitives: AdminPrimitives;
  /** Registered product spaces on the described branch. */
  spaces: string[];
  /** Open target. */
  target: AdminOpenTarget;
  /** Engine package version. */
  version: string;
}

/** Graph summary in describe output. */
export interface AdminGraph {
  /** Visible edge count. */
  edge_count: number;
  /** Graph name. */
  name: string;
  /** Visible node count. */
  node_count: number;
}

/** Health output. */
export interface AdminHealth {
  /** Branch catalog status. */
  branch_catalog: AdminControlStatus;
  /** Active branch count. */
  branch_count: number;
  /** Default product branch. */
  default_branch: string;
  /** Database identity status. */
  identity: AdminControlStatus;
  /** Registry status. */
  registry: AdminControlStatus;
  /** Optional branch-local space catalog status. */
  space_catalog?: AdminControlStatus | null;
  /** Worst health status. */
  status: AdminHealthStatus;
}

/** Health status exposed in admin outputs. */
export type AdminHealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * One connected IPC client, as reported by `ipc_status`. Display identity
 * only — the socket's same-user permission check is the security boundary.
 */
export interface AdminIpcClient {
  /** The session access this connection was granted. */
  access: SessionAccess;
  /** Client-reported product name (`strata-vscode`, `strata`), if any. */
  name?: string | null;
  /** Client-reported process id, if any. */
  pid?: number | null;
  /** The negotiated wire protocol revision (1 = legacy, no hello). */
  protocol: number;
  /** Client-reported version, if any. */
  version?: string | null;
}

/** Multi-process IPC status output. */
export interface AdminIpcStatus {
  /** Number of clients currently connected to the host (0 when not hosting). */
  client_count: number;
  /**
   * The connected clients, as their hellos introduced them; a protocol-1
   * (pre-hello) connection appears anonymous. Empty when not hosting.
   */
  clients?: AdminIpcClient[];
  /** True when this process is hosting a broker socket for other processes. */
  hosting: boolean;
  /**
   * True when this process owns the store (holds the writer lock); false
   * when it is a client of another same-machine owner.
   */
  is_owner: boolean;
  /** The hosting owner's process id, when known. */
  owner_pid?: number | null;
  /** The hosted (or connected) socket path, when one exists. */
  socket_path?: string | null;
}

/** Multi-process IPC stop output. */
export interface AdminIpcStop {
  /**
   * True when a running host was stopped; false when this process was not
   * hosting a socket (nothing to stop).
   */
  stopped: boolean;
}

/** Metrics output. */
export interface AdminMetrics {
  /** Active branch count. */
  branch_count: number;
  /** Control-plane health status. */
  control_status: AdminHealthStatus;
  /** True when storage is durable. */
  durable: boolean;
  /** True while the database handle is open. */
  open: boolean;
  /** Registered space count for the selected branch. */
  space_count: number;
  /** Open target. */
  target: AdminOpenTarget;
}

/** Database open target exposed in admin outputs. */
export type AdminOpenTarget = "cache" | "durable_local";

/** Primitive summaries in describe output. */
export interface AdminPrimitives {
  /** Visible event count in the described space. */
  event_count: number;
  /** Graph summaries. */
  graphs: AdminGraph[];
  /** Visible JSON document count in the described space. */
  json_count: number;
  /** Visible KV row count in the described space. */
  kv_count: number;
  /** Vector collection summaries. */
  vector_collections: AdminVectorCollection[];
}

/** Vector collection summary in describe output. */
export interface AdminVectorCollection {
  /** Visible vector count. */
  count: number;
  /** Embedding dimension. */
  dimension: number;
  /** Distance metric. */
  metric: VectorDistanceMetric;
  /** Collection name. */
  name: string;
}

/** Product primitive selected by Arrow export. */
export type ArrowExportPrimitive = "kv" | "json" | "event" | "vector" | "graph";

/** Arrow export summary. */
export interface ArrowExportResult {
  format: ArrowFileFormat;
  paths: string[];
  primitive: ArrowExportPrimitive;
  row_count: number;
  size_bytes: number;
}

/** Arrow file format selected for import/export. */
export type ArrowFileFormat = "parquet" | "csv" | "jsonl";

/** Arrow import summary. */
export interface ArrowImportResult {
  batches_processed: number;
  file_path: string;
  rows_imported: number;
  rows_skipped: number;
  target: ArrowImportTarget;
}

/** Product primitive targeted by Arrow import. */
export type ArrowImportTarget = "kv" | "json" | "vector" | "graph" | "event";

/** One event batch append entry. */
export interface BatchEventEntry {
  event_type: string;
  payload: unknown;
}

/**
 * Positional batch existence result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status and error;
 * this payload carries the echoed key and the definitive existence answer.
 */
export interface BatchExistsItemResult {
  exists: boolean;
  key: Bytes;
}

/**
 * Positional batch-existence item: whether the key at this position exists.
 * json/vector batch reads are positional (no echoed key), so `batch_exists`
 * carries only the presence bool; callers correlate by the `BatchItem` index.
 */
export interface BatchExistsPresence {
  exists: boolean;
}

/**
 * Positional batch read result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status and error;
 * this payload carries the echoed key and the read facts.
 */
export interface BatchGetItemResult {
  found: boolean;
  key: Bytes;
  timestamp?: number | null;
  value?: Bytes | null;
  version?: number | null;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: BatchItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem10 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: GraphBatchItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem2 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: BatchGetItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem3 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: JsonBatchItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem4 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: JsonBatchGetItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem5 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: BatchExistsItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem6 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: BatchExistsPresence | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem7 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: VectorBatchItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem8 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: VectorBatchGetItemResult | null;
  status: BatchItemStatus;
}

/** Shared positional item wrapper for all public batch responses. */
export interface BatchItem9 {
  applied: boolean;
  commit?: CommitReceipt | null;
  effect?: MutationEffect | null;
  error?: ErrorStatus | null;
  index: number;
  result?: EventBatchAppendItemResult | null;
  status: BatchItemStatus;
}

/**
 * Positional batch write result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status, mutation
 * effect, commit receipt, and error; this payload carries only the KV-specific
 * echoed key.
 */
export interface BatchItemResult {
  key: Bytes;
}

/** Normalized positional item status within a batch response. */
export type BatchItemStatus = "ok" | "miss" | "error";

/** Entry for a batch JSON delete. */
export interface BatchJsonDeleteEntry {
  key: string;
  path: string;
}

/** Entry for a batch JSON set. */
export interface BatchJsonEntry {
  key: string;
  path: string;
  value: unknown;
}

/** Entry for a batch JSON get. */
export interface BatchJsonGetEntry {
  key: string;
  path: string;
}

/** Entry for a batch KV write. */
export interface BatchKvEntry {
  key: Bytes;
  value: Bytes;
}

/** Batch execution semantics. */
export type BatchMode = "atomic" | "itemwise";

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult2 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem2[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult3 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem3[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult4 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem4[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult5 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem5[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult6 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem6[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult7 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem7[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult8 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem8[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Shared batch response wrapper for all public batch commands. */
export interface BatchResult9 {
  applied: boolean;
  commit?: CommitReceipt | null;
  items: BatchItem9[];
  mode: BatchMode;
  status: BatchStatus;
}

/** Normalized batch-level outcome status. */
export type BatchStatus = "ok" | "partial" | "error";

/** One vector batch upsert entry. */
export interface BatchVectorEntry {
  key: string;
  metadata?: unknown;
  /**
   * Dense embedding at wire (f64) precision; narrowed to the stored f32 by the
   * engine, which rejects values that underflow or overflow f32.
   */
  vector: number[];
}

/** Cleanup facts for branch deletion. */
export interface BranchCleanupItem {
  protected_tables: number;
  releasable_tables: number;
  removed_refs: number;
}

/** Branch summary exposed through the command boundary. */
export interface BranchItem {
  branch_id: string;
  created_at?: number | null;
  deleted_at?: number | null;
  generation: number;
  name: string;
  parent?: BranchParentItem | null;
  state_revision: number;
  status: BranchStatus;
}

/** Fork parent facts exposed through the command boundary. */
export interface BranchParentItem {
  branch_id: string;
  fork_timestamp?: number | null;
  fork_version: number;
  generation: number;
  name: string;
}

/** Branch status exposed through the command boundary. */
export type BranchStatus = "active" | "deleted";

/**
 * One generation choice.
 *
 * Carries optional f32 log-probabilities, so this type is [`PartialEq`] but
 * not [`Eq`].
 */
export interface ChatChoice {
  /** Why this choice stopped. */
  finish_reason: FinishReason;
  /** Choice index. */
  index: number;
  /** Per-token log-probabilities, when requested via `logprobs`. */
  logprobs?: LogProbs | null;
  /** The assistant message. */
  message: ChatMessage;
}

/**
 * One chat message. (Content is text in this phase; typed multimodal parts
 * arrive in a later phase.)
 */
export interface ChatMessage {
  /**
   * Message text. Empty (or omitted) for an assistant turn that only calls
   * tools.
   */
  content?: string;
  /** Optional author name (OpenAI `name`). */
  name?: string | null;
  /** Message author. */
  role: Role;
  /** For a `tool` message: the id of the [`ToolCall`] this message answers. */
  tool_call_id?: string | null;
  /**
   * Tool calls emitted by the assistant (function calling). Present on an
   * assistant message that invokes one or more tools.
   */
  tool_calls?: ToolCall[] | null;
}

/**
 * A generation request: the OpenAI Chat Completions body plus Strata /
 * llama.cpp extension fields.
 *
 * Exactly one of `messages` (chat) or `prompt` (raw completion) must be set.
 * Unknown fields are ignored (OpenAI-compatible, forward-compatible with
 * provider `extra_body`), a deliberate exception to Strata's strict-wire
 * default for this knob-rich body.
 */
export interface ChatRequest {
  /** Frequency penalty. */
  frequency_penalty?: number | null;
  /** GBNF grammar for constrained generation (local). */
  grammar?: string | null;
  /** Per-token logit bias (token id → bias). */
  logit_bias?: {
    [key: string]: number;
  } | null;
  /** Whether to return log-probabilities. */
  logprobs?: boolean | null;
  /** Maximum completion tokens. */
  max_tokens?: number | null;
  /** Chat messages (system/user/assistant/tool). */
  messages?: ChatMessage[] | null;
  /** Min-p sampling cutoff. */
  min_p?: number | null;
  /** Mirostat sampling. */
  mirostat?: Mirostat | null;
  /** Per-model load/context configuration. */
  model_config?: ModelConfig | null;
  /** Presence penalty. */
  presence_penalty?: number | null;
  /** Raw completion prompt (base models / full control). */
  prompt?: string | null;
  /** Repetition penalty look-back window. */
  repeat_last_n?: number | null;
  /** Repetition penalty. */
  repeat_penalty?: number | null;
  /** Output format constraint. */
  response_format?: ResponseFormat | null;
  /** Deterministic sampling seed. */
  seed?: number | null;
  /** Stop sequences. */
  stop?: string[] | null;
  /** Token-id stop sequences (local). */
  stop_token_ids?: number[] | null;
  /** Sampling temperature. */
  temperature?: number | null;
  /** Tail-free sampling z. */
  tfs_z?: number | null;
  /** How the model should choose among `tools`. */
  tool_choice?: ToolChoice | null;
  /** Tools (functions) the model may call. */
  tools?: Tool[] | null;
  /** Top-k sampling cutoff. */
  top_k?: number | null;
  /** Number of top log-probabilities to return per token. */
  top_logprobs?: number | null;
  /** Nucleus sampling cutoff. */
  top_p?: number | null;
  /** Typical-p (locally typical) sampling. */
  typical_p?: number | null;
}

/** A generation response (OpenAI-shaped, minimal). */
export interface ChatResponse {
  /** Generation choices (one today). */
  choices: ChatChoice[];
  /** Resolved model spec. */
  model: string;
  /** Token usage. */
  usage: Usage;
}

/**
 * Per-commit durability, as storage attested it at acknowledgement time.
 *
 * `standard` is an admission fact, not a survival guarantee: the commit
 * becomes durable at the next sync point (close, threshold, rotation) and
 * can be lost to process kill until then. Only `always` attests the commit
 * was synced before acknowledgement. `uncertain` means storage could not
 * attest either way (#2756: the former `durable` boolean reported
 * `standard` commits as durable, so SDK callers treated unsynced
 * acknowledgements as crash-safe).
 */
export type CommitDurability = "not_durable" | "standard" | "always" | "uncertain";

/** V1 commit outcome status. */
export type CommitOutcomeStatus = "not_applicable" | "not_started" | "definitely_not_committed" | "maybe_committed" | "committed_post_commit_failed";

/** Commit facts returned by mutating operations. */
export interface CommitReceipt {
  delete_count: number;
  durability: CommitDurability;
  put_count: number;
  timestamp: number;
  version: number;
}

/** One embedding result. */
export interface EmbeddingItem {
  /** The embedding vector. */
  embedding: number[];
  /** Position in the input batch. */
  index: number;
}

/** An embeddings request (the OpenAI Embeddings body plus extensions). */
export interface EmbeddingsRequest {
  /** Truncate to this many dimensions (matryoshka), then renormalize. */
  dimensions?: number | null;
  /** Text(s) to embed. */
  input: EmbedInput;
  /** Query vs document role for instruction-tuned embedders. */
  input_type?: InputType | null;
  /** Explicit instruction prefix override. */
  instruction?: string | null;
  /** Force L2 normalization on/off (default per-model). */
  normalize?: boolean | null;
}

/** An embeddings response (OpenAI-shaped). */
export interface EmbeddingsResponse {
  /** One item per input, in order. */
  data: EmbeddingItem[];
  /** Embedding dimension. */
  dimension: number;
  /** Resolved model spec. */
  model: string;
  /** Token usage (when known). */
  usage: Usage;
}

/** Embedding input: a single string or a batch. */
export type EmbedInput = string | string[];

/** V1 public error class. */
export type ErrorClass = "not_found" | "already_exists" | "invalid_argument" | "failed_precondition" | "access_denied" | "conflict" | "ambiguous_commit" | "history_unavailable" | "unsupported" | "resource_exhausted" | "unavailable" | "io" | "corruption" | "serialization" | "internal";

/** Redacted structured error detail. */
export interface ErrorDetail {
  key: string;
  value: string;
}

/** Public V1 executor error status. */
export interface ErrorStatus {
  class: ErrorClass;
  code: string;
  commit_outcome: CommitOutcomeStatus;
  details?: ErrorDetail[];
  docs_url: string;
  hints?: string[];
  message: string;
  reference_id: string;
  retry_policy: RetryPolicy;
  retryable: boolean;
  suggested_fix: string;
  trace_id?: string | null;
}

/**
 * Positional event batch append result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status, mutation
 * effect, commit receipt, and error; this payload carries only the
 * event-specific sequence and type for successful items.
 */
export interface EventBatchAppendItemResult {
  event_type?: string | null;
  sequence?: number | null;
}

/** Event hash-chain verification result. */
export interface EventChainVerification {
  error?: string | null;
  first_invalid?: number | null;
  length: number;
  valid: boolean;
}

/** Event record payload and chain facts. */
export interface EventData {
  event_type: string;
  hash: string;
  payload: unknown;
  previous_hash: string;
  sequence: number;
  timestamp: number;
}

/** Event range direction exposed through the command boundary. */
export type EventRangeDirection = "forward" | "reverse";

/** Event record with commit metadata. */
export interface EventVersionedData {
  event: EventData;
  timestamp: number;
  version: number;
}

/** Why generation stopped (OpenAI `finish_reason` + Strata `cancelled`). */
export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "cancelled";

/** A function tool definition. */
export interface FunctionDef {
  /** What the function does (helps the model decide when to call it). */
  description?: string | null;
  /** Function name the model calls. */
  name: string;
  /** JSON Schema describing the arguments object. */
  parameters?: unknown;
  /** Enforce strict schema adherence. Provider-dependent. */
  strict?: boolean | null;
}

/**
 * Optional size bounds for one graph analytics snapshot (input form).
 * Unset fields use the engine defaults.
 */
export interface GraphAnalyticsBudget {
  /** Maximum edge count admitted into the snapshot. */
  max_edges?: number | null;
  /** Maximum node count admitted into the snapshot. */
  max_nodes?: number | null;
}

/**
 * Positional graph batch write result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status, mutation
 * effect, commit receipt, and error; this payload carries the graph-specific
 * operation identity and the create/delete facts.
 */
export interface GraphBatchItemResult {
  created?: boolean | null;
  deleted?: boolean | null;
  operation: string;
  operation_index: number;
}

/** One graph batch write operation. */
export type GraphBatchOperation = {
  /** Node payload. */
  data: GraphNodeData;
  /** Node id. */
  node_id: string;
  type: "upsert_node";
} | {
  /** Node id. */
  node_id: string;
  type: "delete_node";
} | {
  /** Edge payload. */
  data: GraphEdgeData;
  /** Destination node id. */
  dst: string;
  /** Edge type. */
  edge_type: string;
  /** Source node id. */
  src: string;
  type: "upsert_edge";
} | {
  /** Destination node id. */
  dst: string;
  /** Edge type. */
  edge_type: string;
  /** Source node id. */
  src: string;
  type: "delete_edge";
};

/** Breadth-first-search result (wire form). */
export interface GraphBfsData {
  depths: {
    [key: string]: number;
  };
  edges: GraphBfsEdgeData[];
  graph: string;
  start: string;
  /**
   * Whether a depth or node-count cap stopped the traversal before every
   * reachable node was visited, so `visited`/`edges` are a partial result.
   */
  truncated: boolean;
  visited: string[];
}

/**
 * One traversal step recorded by a breadth-first search (wire form).
 * `src`/`dst` follow traversal order.
 */
export interface GraphBfsEdgeData {
  dst: string;
  edge_type: string;
  src: string;
  weight: number;
}

/** Serializable graph entity binding hit. */
export interface GraphBindingHit {
  binding: GraphEntityBinding;
  graph: string;
  node_id: string;
  timestamp: number;
  version: number;
}

/** Product primitive kind used by graph entity bindings. */
export type GraphBindingPrimitive = "kv" | "json" | "vector" | "event" | "graph";

/** Typed product identity attached to a graph node. */
export interface GraphBindingTarget {
  branch?: string | null;
  key: string;
  primitive: GraphBindingPrimitive;
  space: string;
}

/** One edge in a bulk ingest (input form). */
export interface GraphBulkEdge {
  /** Destination node id. */
  dst: string;
  /** Edge type. */
  edge_type: string;
  /** Optional JSON properties. */
  properties?: unknown;
  /** Source node id. */
  src: string;
  /** Optional weight. Defaults to 1.0. */
  weight?: number | null;
}

/** One node in a bulk ingest (input form). */
export interface GraphBulkNode {
  /** Optional entity binding. */
  binding?: GraphEntityBinding | null;
  /** Node id. */
  node_id: string;
  /** Optional declared object type. */
  object_type?: string | null;
  /** Optional JSON properties. */
  properties?: unknown;
}

/**
 * Community-detection result (wire form). Every node maps to its
 * community representative node id.
 */
export interface GraphCdlpData {
  graph: string;
  labels: {
    [key: string]: string;
  };
}

/** Explicit policy for graph facts bound to a deleted entity. */
export type GraphDeletePolicy = "cascade" | "detach" | "keep_dangling";

/** Graph neighbor traversal direction. */
export type GraphDirection = "outgoing" | "incoming" | "both";

/** Graph edge input payload. */
export interface GraphEdgeData {
  properties?: unknown;
  weight?: number | null;
}

/** Serializable graph edge output. */
export interface GraphEdgeDataOutput {
  dst: string;
  edge_type: string;
  graph: string;
  properties?: unknown;
  src: string;
  timestamp: number;
  version: number;
  weight: number;
}

/** Node-to-entity binding. */
export interface GraphEntityBinding {
  target: GraphBindingTarget;
}

/** Serializable graph metadata. */
export interface GraphInfoData {
  created_timestamp: number;
  created_version: number;
  edge_count: number;
  graph: string;
  node_count: number;
  updated_timestamp: number;
  updated_version: number;
}

/** Local-clustering-coefficient result (wire form). */
export interface GraphLccData {
  coefficients: {
    [key: string]: number;
  };
  graph: string;
}

/** A declared link type (wire form). `cardinality` is a recorded hint. */
export interface GraphLinkTypeDefData {
  cardinality?: string | null;
  name: string;
  properties?: {
    [key: string]: GraphPropertyDef;
  };
  source: string;
  target: string;
}

/** One link type with its visible edge count (wire form). */
export interface GraphLinkTypeSummaryData {
  cardinality?: string | null;
  edge_count: number;
  name: string;
  properties?: {
    [key: string]: GraphPropertyDef;
  };
  source: string;
  target: string;
}

/** Serializable graph neighbor hit. */
export interface GraphNeighborHit {
  direction: GraphDirection;
  dst: string;
  edge: GraphEdgeDataOutput;
  edge_type: string;
  graph: string;
  node: GraphNodeDataOutput;
  node_id: string;
  src: string;
  /** Bound-entity resolution status; absent when the node is unbound. */
  target_status?: string | null;
}

/** Graph node input payload. */
export interface GraphNodeData {
  binding?: GraphEntityBinding | null;
  /** Optional declared object type (validated against a frozen ontology). */
  object_type?: string | null;
  properties?: unknown;
}

/** Serializable graph node output. */
export interface GraphNodeDataOutput {
  binding?: GraphEntityBinding | null;
  graph: string;
  node_id: string;
  object_type?: string | null;
  properties?: unknown;
  timestamp: number;
  version: number;
}

/** A declared object type (wire form). */
export interface GraphObjectTypeDefData {
  name: string;
  properties?: {
    [key: string]: GraphPropertyDef;
  };
}

/** One object type with its visible node count (wire form). */
export interface GraphObjectTypeSummaryData {
  name: string;
  node_count: number;
  properties?: {
    [key: string]: GraphPropertyDef;
  };
}

/** A graph's ontology: status plus every declared type (wire form). */
export interface GraphOntologyData {
  graph: string;
  link_types?: GraphLinkTypeDefData[];
  object_types?: GraphObjectTypeDefData[];
  status: string;
  timestamp: number;
  version: number;
}

/** The ontology with per-type usage counts (wire form). */
export interface GraphOntologySummaryData {
  graph: string;
  link_types?: GraphLinkTypeSummaryData[];
  object_types?: GraphObjectTypeSummaryData[];
  status: string;
  timestamp: number;
  version: number;
}

/** `PageRank` result (wire form). */
export interface GraphPagerankData {
  graph: string;
  iterations: number;
  personalized: boolean;
  ranks: {
    [key: string]: number;
  };
}

/**
 * One declared property on a graph object or link type (wire form).
 * `value_type` is a recorded hint, not an enforced constraint.
 */
export interface GraphPropertyDef {
  required?: boolean;
  value_type?: string | null;
}

/** Shortest-path result (wire form). Unreachable nodes are omitted. */
export interface GraphSsspData {
  direction: GraphDirection;
  distances: {
    [key: string]: number;
  };
  graph: string;
  source: string;
}

/**
 * Weakly-connected-components result (wire form). Every node maps to
 * its component representative: the smallest node id in the component.
 */
export interface GraphWccData {
  component_count: number;
  components: {
    [key: string]: string;
  };
  graph: string;
}

/** Version-history item. */
export interface HistoryItem {
  timestamp: number;
  tombstone: boolean;
  value?: Bytes | null;
  version: number;
}

/** Version-history result for one key. */
export interface HistoryResult {
  items: HistoryItem[];
}

/** Provider/model capability facts. */
export interface InferenceCapability {
  /** Whether embedding is supported. */
  can_embed: boolean;
  /** Whether generation is supported. */
  can_generate: boolean;
  /** Whether ranking is supported. */
  can_rank: boolean;
  /** Whether tokenization is supported. */
  can_tokenize: boolean;
  /** Known embedding dimension, if available. */
  embedding_dim: number;
  /** Model name or path after provider parsing. */
  model: string;
  /** Whether this runtime configuration currently allows network access. */
  network_enabled: boolean;
  /** Provider kind. */
  provider: ProviderKind;
  /** Whether this binary was compiled with the provider feature needed for execution. */
  provider_feature_enabled: boolean;
  /** Whether the provider requires an API key. */
  requires_api_key: boolean;
  /** Whether the operation requires network access. */
  requires_network: boolean;
  /** Whether `response_format: json_object` is honored. */
  supports_json_object: boolean;
  /** Whether `response_format: json_schema` (structured output) is honored. */
  supports_json_schema: boolean;
  /** Whether `logprobs` are returned in the response. */
  supports_logprobs: boolean;
  /** Whether chat requests may offer `tools` (function calling). */
  supports_tools: boolean;
}

/** Instruction-tuned embedder input role. */
export type InputType = "query" | "document";

/**
 * Positional JSON batch read result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status and error;
 * this payload carries the read facts.
 */
export interface JsonBatchGetItemResult {
  document_version?: number | null;
  found: boolean;
  timestamp?: number | null;
  value: unknown;
  version?: number | null;
}

/**
 * Positional JSON batch write/delete result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status, mutation
 * effect, commit receipt, and error; this payload carries only the
 * JSON-specific document version.
 */
export interface JsonBatchItemResult {
  document_version?: number | null;
}

/** JSON version-history item. */
export interface JsonHistoryItem {
  document_version?: number | null;
  timestamp: number;
  tombstone: boolean;
  value?: unknown;
  version: number;
}

/** JSON secondary index definition exposed through the command boundary. */
export interface JsonIndexDefinition {
  created_timestamp: number;
  created_version: number;
  field_path: string;
  index_type: JsonIndexType;
  name: string;
  space: string;
}

/** JSON secondary index kind exposed through the command boundary. */
export type JsonIndexType = "numeric" | "tag" | "text";

/** Sampled JSON document. */
export interface JsonSampleItem {
  document_version: number;
  key: string;
  timestamp: number;
  value: unknown;
  version: number;
}

/** A named JSON Schema for structured outputs (OpenAI `json_schema` block). */
export interface JsonSchemaSpec {
  /** Human-readable description of the schema's intent. */
  description?: string | null;
  /** Schema name (the identifier the model is told to conform to). */
  name: string;
  /** The JSON Schema the output must validate against. */
  schema: unknown;
  /**
   * Enforce strict adherence (no additional properties). Provider-dependent;
   * enforced exactly for local (GBNF) and OpenAI structured outputs.
   */
  strict?: boolean | null;
}

/** Stored JSON value with commit metadata. */
export interface JsonVersionedValue {
  document_version: number;
  timestamp: number;
  value: unknown;
  version: number;
}

/** Per-token log-probabilities for a choice (OpenAI `logprobs.content`). */
export interface LogProbs {
  /** One entry per generated token, in order. */
  content: TokenLogProb[];
}

/**
 * Point-read envelope shared by every capability's single-record `get`.
 *
 * `found` is the authoritative presence flag; `value` carries the record only
 * when it exists. A missing record serializes as `{found: false, value: null}`
 * and a present one as `{found: true, value: <record>}`, so absence never
 * aliases a bare `null` payload and every primitive answers a point read the
 * same shape.
 *
 * The payload is `Option<T>` because these primitives never store a JSON
 * `null` as a record — struct payloads round-trip cleanly through
 * `Option<T>`. JSON is the one exception: a stored JSON `null` is a real value
 * that `Option<serde_json::Value>` would collapse to absence on deserialize,
 * so JSON reads use the dedicated [`MaybeJsonValue`](super::MaybeJsonValue)
 * envelope, which carries a non-optional `value` to keep found-null distinct
 * from absent. Both envelopes serialize the same `{found, value}` wire shape.
 */
export interface Maybe {
  found: boolean;
  value?: VersionedValue | null;
}

/**
 * Point-read envelope shared by every capability's single-record `get`.
 *
 * `found` is the authoritative presence flag; `value` carries the record only
 * when it exists. A missing record serializes as `{found: false, value: null}`
 * and a present one as `{found: true, value: <record>}`, so absence never
 * aliases a bare `null` payload and every primitive answers a point read the
 * same shape.
 *
 * The payload is `Option<T>` because these primitives never store a JSON
 * `null` as a record — struct payloads round-trip cleanly through
 * `Option<T>`. JSON is the one exception: a stored JSON `null` is a real value
 * that `Option<serde_json::Value>` would collapse to absence on deserialize,
 * so JSON reads use the dedicated [`MaybeJsonValue`](super::MaybeJsonValue)
 * envelope, which carries a non-optional `value` to keep found-null distinct
 * from absent. Both envelopes serialize the same `{found, value}` wire shape.
 */
export interface Maybe2 {
  found: boolean;
  value?: VectorVersionedData | null;
}

/**
 * Point-read envelope shared by every capability's single-record `get`.
 *
 * `found` is the authoritative presence flag; `value` carries the record only
 * when it exists. A missing record serializes as `{found: false, value: null}`
 * and a present one as `{found: true, value: <record>}`, so absence never
 * aliases a bare `null` payload and every primitive answers a point read the
 * same shape.
 *
 * The payload is `Option<T>` because these primitives never store a JSON
 * `null` as a record — struct payloads round-trip cleanly through
 * `Option<T>`. JSON is the one exception: a stored JSON `null` is a real value
 * that `Option<serde_json::Value>` would collapse to absence on deserialize,
 * so JSON reads use the dedicated [`MaybeJsonValue`](super::MaybeJsonValue)
 * envelope, which carries a non-optional `value` to keep found-null distinct
 * from absent. Both envelopes serialize the same `{found, value}` wire shape.
 */
export interface Maybe3 {
  found: boolean;
  value?: EventVersionedData | null;
}

/**
 * Point-read envelope shared by every capability's single-record `get`.
 *
 * `found` is the authoritative presence flag; `value` carries the record only
 * when it exists. A missing record serializes as `{found: false, value: null}`
 * and a present one as `{found: true, value: <record>}`, so absence never
 * aliases a bare `null` payload and every primitive answers a point read the
 * same shape.
 *
 * The payload is `Option<T>` because these primitives never store a JSON
 * `null` as a record — struct payloads round-trip cleanly through
 * `Option<T>`. JSON is the one exception: a stored JSON `null` is a real value
 * that `Option<serde_json::Value>` would collapse to absence on deserialize,
 * so JSON reads use the dedicated [`MaybeJsonValue`](super::MaybeJsonValue)
 * envelope, which carries a non-optional `value` to keep found-null distinct
 * from absent. Both envelopes serialize the same `{found, value}` wire shape.
 */
export interface Maybe4 {
  found: boolean;
  value?: GraphNodeDataOutput | null;
}

/**
 * Point-read envelope shared by every capability's single-record `get`.
 *
 * `found` is the authoritative presence flag; `value` carries the record only
 * when it exists. A missing record serializes as `{found: false, value: null}`
 * and a present one as `{found: true, value: <record>}`, so absence never
 * aliases a bare `null` payload and every primitive answers a point read the
 * same shape.
 *
 * The payload is `Option<T>` because these primitives never store a JSON
 * `null` as a record — struct payloads round-trip cleanly through
 * `Option<T>`. JSON is the one exception: a stored JSON `null` is a real value
 * that `Option<serde_json::Value>` would collapse to absence on deserialize,
 * so JSON reads use the dedicated [`MaybeJsonValue`](super::MaybeJsonValue)
 * envelope, which carries a non-optional `value` to keep found-null distinct
 * from absent. Both envelopes serialize the same `{found, value}` wire shape.
 */
export interface Maybe5 {
  found: boolean;
  value?: GraphEdgeDataOutput | null;
}

/**
 * JSON point-read result that distinguishes absence from a stored JSON null.
 *
 * Serializes the same `{found, value}` wire shape as the shared
 * [`Maybe`](super::Maybe) envelope, but carries a non-optional `value` so a
 * stored JSON `null` (`found: true, value: null`) stays distinct from an
 * absent document (`found: false, value: null`). `Maybe<serde_json::Value>`
 * cannot express that distinction because `Option<Value>` deserializes a JSON
 * `null` back to absence — hence this dedicated type.
 */
export interface MaybeJsonValue {
  found: boolean;
  value: unknown;
}

/** JSON versioned point-read result that distinguishes absence from a stored JSON null. */
export interface MaybeJsonVersionedValue {
  found: boolean;
  value?: JsonVersionedValue | null;
}

/** Mirostat perplexity-control sampling (llama.cpp extension). */
export interface Mirostat {
  /** Learning rate (eta). */
  eta: number;
  /** Algorithm version: 1 or 2. */
  mode: number;
  /** Target entropy (tau). */
  tau: number;
}

/** Model cache facts exposed for diagnostics. */
export interface ModelCacheStatus {
  /** Cached embedding model specs. */
  embedding_models: string[];
  /** Cached generation model specs. */
  generation_models: string[];
  /** Cached ranking model specs. */
  ranking_models: string[];
}

/**
 * Per-model load/context configuration (llama.cpp local; ignored by cloud).
 * Set once and cache-keyed — not repeated per call.
 */
export interface ModelConfig {
  /**
   * Named chat template (e.g. `"chatml"`, `"llama3"`, `"gemma"`) overriding
   * the model's embedded `tokenizer.chat_template`.
   */
  chat_format?: string | null;
  /** Enable flash attention. */
  flash_attn?: boolean | null;
  /** Logical batch size. */
  n_batch?: number | null;
  /** Context window size. */
  n_ctx?: number | null;
  /** GPU layers to offload (-1 = all). */
  n_gpu_layers?: number | null;
  /** CPU threads. */
  n_threads?: number | null;
  /** Embedding pooling strategy. */
  pooling?: Pooling | null;
}

/** Information about a resolved model. */
export interface ModelInfo {
  /** Model architecture family. */
  architecture: string;
  /** Default quantization variant. */
  default_quant: string;
  /** Embedding dimension, or zero for non-embedding models. */
  embedding_dim: number;
  /** HuggingFace repository for the model artifact. */
  hf_repo: string;
  /** Whether the model artifact is present locally. */
  is_local: boolean;
  /** Local GGUF path when present. */
  local_path?: string | null;
  /** Stable model catalog name. */
  name: string;
  /** Approximate model artifact size in bytes. */
  size_bytes: number;
  /** Model task type. */
  task: ModelTask;
}

/** What a model is designed for. */
export type ModelTask = "embed" | "generate" | "rank";

/** Normalized mutation effect facts. */
export interface MutationEffect {
  affected_count: number;
  applied: boolean;
  kind: MutationEffectKind;
  matched: boolean;
}

/** High-level mutation effect for idempotent and conditional operations. */
export type MutationEffectKind = "created" | "updated" | "deleted" | "unchanged" | "not_found";

/** Force a specific function call (`{"type":"function","function":{"name":…}}`). */
export type NamedToolChoice = {
  /** The function to force. */
  function: ToolChoiceFunction;
  type: "function";
};

/** Embedding pooling strategy (a context-creation param — load-time). */
export type Pooling = "mean" | "cls" | "last" | "rank";

/** Which inference provider to use. */
export type ProviderKind = "local" | "anthropic" | "openai" | "google";

/** Pull-model command output. */
export interface PullModelOutput {
  /** Requested model spec. */
  model: string;
  /** Local path containing the resolved GGUF file. */
  path: string;
}

/** Ranking request. */
export interface RankRequest {
  /** Candidate passages. */
  passages: string[];
  /** Query text. */
  query: string;
}

/** Ranking response. */
export interface RankResponse {
  /** Ordered ranking item outcomes. */
  items: RankRuntimeOutcome[];
}

/** Ranking item outcome. */
export type RankRuntimeOutcome = {
  /** Passage index. */
  index: number;
  /** Relevance score. */
  score: number;
  status: "ok";
} | {
  /** Stable error code. */
  code: string;
  /** Passage index. */
  index: number;
  /** Redacted public error message. */
  message: string;
  status: "error";
};

/** One fetched branch in the recorded base frontier. */
export interface RemoteOriginFrontierInfo {
  /** The bundle's per-branch base token. */
  base: string;
  /** The fetched branch name. */
  branch: string;
  /** Local head version at the sync point, when recorded. */
  local_version?: number | null;
}

/** Serialized view of a database's recorded remote origin. */
export interface RemoteOriginInfo {
  /** Per-branch base frontier recorded at the sync point. */
  base_frontier: RemoteOriginFrontierInfo[];
  /** The branch the clone opened by default. */
  branch: string;
  /** The remote dataset name. */
  dataset: string;
  /** When the fetch happened (Unix microseconds). */
  fetched_at_micros: number;
  /** The fetched bundle's manifest hash. */
  manifest_hash: string;
  /** The remote host the database was fetched from. */
  remote_url: string;
}

/**
 * Output format constraint.
 *
 * `JsonSchema` carries the schema as an opaque [`serde_json::Value`], so this
 * enum is [`PartialEq`] but not [`Eq`].
 */
export type ResponseFormat = {
  type: "text";
} | {
  type: "json_object";
} | {
  /** The named schema the output must conform to. */
  json_schema: JsonSchemaSpec;
  type: "json_schema";
};

/** V1 retry policy. */
export type RetryPolicy = "never" | "after_state_change" | "same_request" | "idempotent_only" | "unknown";

/** A chat message role. */
export type Role = "system" | "user" | "assistant" | "tool";

/** Sampled KV item. */
export interface SampleItem {
  key: Bytes;
  timestamp: number;
  value: Bytes;
  version: number;
}

/** KV scan item. */
export interface ScanItem {
  key: Bytes;
  timestamp: number;
  value: Bytes;
  version: number;
}

/**
 * The access a session declares at hello. The owner's dispatch gate rejects
 * write-classified commands on a `Read` session; see the IPC evolution
 * design (`docs/architecture/ipc/ipc-evolution-design.md` §4.2).
 */
export type SessionAccess = "read" | "read_write";

/** Log-probability of one generated token. */
export interface TokenLogProb {
  /** Raw UTF-8 bytes of the token (present when it is not standalone-UTF-8). */
  bytes?: number[] | null;
  /** Natural-log probability of the token. */
  logprob: number;
  /** The token text. */
  token: string;
  /** The most likely alternatives at this position (up to `top_logprobs`). */
  top_logprobs?: TopLogProb[];
}

/**
 * A tool the model may call. Only `function` tools exist today (OpenAI-shaped);
 * the tagged form reserves room for future tool kinds.
 *
 * Holds a JSON-Schema [`serde_json::Value`], so this type is [`PartialEq`] but
 * not [`Eq`].
 */
export type Tool = {
  /** The function definition. */
  function: FunctionDef;
  type: "function";
};

/** A tool call emitted by the assistant. */
export type ToolCall = {
  /** The invoked function and its arguments. */
  function: ToolCallFunction;
  /** Provider-assigned call id (echoed in the answering `tool` message). */
  id: string;
  type: "function";
};

/** The function invoked by a [`ToolCall`]. */
export interface ToolCallFunction {
  /** Arguments as a JSON-encoded string (OpenAI convention). */
  arguments: string;
  /** Function name. */
  name: string;
}

/** How the model should choose among the offered `tools`. */
export type ToolChoice = ToolChoiceMode | NamedToolChoice;

/** The function a [`NamedToolChoice`] forces. */
export interface ToolChoiceFunction {
  /** Function name to force. */
  name: string;
}

/** Coarse tool-choice mode. */
export type ToolChoiceMode = "none" | "auto" | "required";

/** One alternative token and its log-probability. */
export interface TopLogProb {
  /** Raw UTF-8 bytes of the token. */
  bytes?: number[] | null;
  /** Natural-log probability of the token. */
  logprob: number;
  /** The token text. */
  token: string;
}

/** Token usage accounting. */
export interface Usage {
  /** Completion token count. */
  completion_tokens: number;
  /** Prompt token count. */
  prompt_tokens: number;
  /** Total tokens. */
  total_tokens: number;
}

/**
 * Positional vector batch read result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status and error;
 * this payload carries the read facts.
 */
export interface VectorBatchGetItemResult {
  found: boolean;
  value?: VectorVersionedData | null;
}

/**
 * Positional vector batch write/delete result payload.
 *
 * The shared [`BatchItem`](crate::BatchItem) wrapper owns the status, mutation
 * effect, commit receipt, and error; this payload carries only the
 * vector-specific revision.
 */
export interface VectorBatchItemResult {
  vector_revision?: number | null;
}

/** Vector collection facts. */
export interface VectorCollectionInfo {
  count: number;
  dimension: number;
  metric: VectorDistanceMetric;
  name: string;
}

/** Vector value payload. */
export interface VectorData {
  embedding: number[];
  metadata?: unknown;
}

/** Vector distance metric exposed through the command boundary. */
export type VectorDistanceMetric = "cosine" | "euclidean" | "dot_product";

/** One vector metadata filter condition. */
export interface VectorFilterCondition {
  field: string;
  op: VectorFilterOp;
  value: VectorScalar;
}

/** Vector metadata filter operation. */
export type VectorFilterOp = "eq";

/** Vector history item. */
export interface VectorHistoryItem {
  data?: VectorData | null;
  key: string;
  timestamp: number;
  tombstone: boolean;
  vector_revision?: number | null;
  version: number;
}

/** Vector history result for one key. */
export interface VectorHistoryResult {
  items: VectorHistoryItem[];
}

/** One vector index artifact diagnostic. */
export interface VectorIndexArtifactSource {
  artifact_id: string;
  searched: boolean;
  status: string;
}

/** Vector index planner diagnostics. */
export interface VectorIndexDiagnostics {
  active_delta_count: number;
  active_delta_seal_threshold: number;
  active_delta_source_count: number;
  artifact_sources: VectorIndexArtifactSource[];
  collection: string;
  collection_exact_threshold: number;
  derived_bytes: number;
  exact_fallback_count: number;
  exact_source_count: number;
  filtered_underfill_fallback: boolean;
  flat_source_count: number;
  hnsw_graph_builds: number;
  hnsw_memory_budget_bytes: number;
  hnsw_source_count: number;
  indexed_source_count: number;
  indexed_vector_count: number;
  last_query_fallback_reason?: string | null;
  last_query_used_index: boolean;
  manifest_generation?: number | null;
  manifest_inherited_ref_count: number;
  manifest_owned_ref_count: number;
  manifest_ref_count: number;
  manifest_status: string;
  overfetch_factor: number;
  policy_mode: string;
  resolved_index_kind_summary: string;
  source_candidate_limit: number;
  source_flat_threshold: number;
  source_hnsw_threshold: number;
}

/** Vector index search output. */
export interface VectorIndexQueryResult {
  diagnostics: VectorIndexDiagnostics;
  matches: VectorMatch[];
}

/** One vector search match. */
export interface VectorMatch {
  key: string;
  metadata?: unknown;
  score: number;
}

/** AND-composed vector metadata filter. */
export interface VectorMetadataFilter {
  conditions: VectorFilterCondition[];
}

/** Scalar value used by vector metadata filters. */
export type VectorScalar = {
  type: "null";
} | {
  type: "bool";
  value: boolean;
} | {
  type: "number";
  value: number;
} | {
  type: "string";
  value: string;
};

/** Vector value with commit metadata. */
export interface VectorVersionedData {
  data: VectorData;
  key: string;
  timestamp: number;
  vector_revision: number;
  version: number;
}

/** Stored value with commit metadata. */
export interface VersionedValue {
  timestamp: number;
  value: Bytes;
  version: number;
}

/** Returns sanitized configuration facts. */
export interface AdminConfigRequest {
  type: "config_get";
}

/** Sanitized configuration facts. */
export interface AdminConfigResponse {
  data: AdminConfig;
  type: "config";
}

/** Returns one sanitized configuration value by key. */
export interface AdminConfigKeyRequest {
  /** Config key. */
  key: string;
  type: "configure_get_key";
}

/** Optional sanitized configuration value. */
export interface AdminConfigKeyResponse {
  data: string | null;
  type: "config_value";
}

/** Returns a compact database description. */
export interface AdminDescribeRequest {
  /** Branch whose primitive data should be described. Defaults to the executor handle branch. */
  branch?: string | null;
  type: "describe";
}

/** Compact database description. */
export interface AdminDescribeResponse {
  data: AdminDescribe;
  type: "described";
}

/** Returns control-plane health facts. */
export interface AdminHealthRequest {
  /** Branch whose space catalog should be checked. Defaults to the executor handle branch. */
  branch?: string | null;
  type: "health";
}

/** Control-plane health facts. */
export interface AdminHealthResponse {
  data: AdminHealth;
  type: "health";
}

/**
 * Clones a dataset from a hub into a new local database directory.
 *
 * Orchestration (resolution, download, verification, reconstitution,
 * origin recording) runs once behind this command; every frontend
 * reaches it here. The session database is not touched.
 */
export interface AdminHubCloneRequest {
  /** Branch to fetch. Defaults to the dataset's default branch. */
  branch?: string | null;
  /** Dataset to clone. */
  dataset: string;
  /** Destination directory (must not exist, or be empty). */
  dest: string;
  /**
   * Explicit hub URL; when absent the 5-layer resolver runs
   * (flag, `STRATA_HUB_URL`, project config, global config).
   */
  hub_url?: string | null;
  type: "hub_clone";
}

/** A completed hub clone. */
export interface AdminHubCloneResponse {
  data: {
    /** Branch fetched. */
    branch: string;
    /** Dataset cloned. */
    dataset: string;
    /** Destination directory holding the new database. */
    dest: string;
    /** The bundle's manifest hash. */
    manifest_hash: string;
    /** Objects fetched. */
    object_count: number;
    /** Total bytes fetched. */
    total_bytes: number;
  };
  type: "hub_clone_result";
}

/** Returns database identity and catalog summary. */
export interface AdminInfoRequest {
  /** Branch whose space catalog should be summarized. Defaults to the executor handle branch. */
  branch?: string | null;
  type: "info";
}

/** Database identity and catalog summary. */
export interface AdminInfoResponse {
  data: AdminDatabaseInfo;
  type: "database_info";
}

/**
 * Reports this process's multi-process IPC state (whether it hosts a
 * broker socket, the socket path, owner pid, and live client count).
 */
export interface AdminIpcStatusRequest {
  type: "ipc_status";
}

/** Multi-process IPC state for this process. */
export interface AdminIpcStatusResponse {
  data: AdminIpcStatus;
  type: "ipc_status";
}

/**
 * Stops hosting the multi-process broker socket (a client forwards this to
 * the owner). Idempotent; a non-host reports nothing was stopped.
 */
export interface AdminIpcStopRequest {
  type: "ipc_stop";
}

/** Result of stopping multi-process IPC hosting. */
export interface AdminIpcStopResponse {
  data: AdminIpcStop;
  type: "ipc_stop";
}

/** Returns lightweight database metrics. */
export interface AdminMetricsRequest {
  /** Branch whose space catalog should be counted. Defaults to the executor handle branch. */
  branch?: string | null;
  type: "metrics";
}

/** Lightweight database metrics. */
export interface AdminMetricsResponse {
  data: AdminMetrics;
  type: "metrics";
}

/** Lightweight admin liveness check. */
export interface AdminPingRequest {
  type: "ping";
}

/** Lightweight admin liveness result. */
export interface AdminPingResponse {
  data: {
    /** Engine package version. */
    version: string;
  };
  type: "pong";
}

/**
 * Reads where this database was cloned from (its remote origin),
 * when clone recorded one.
 */
export interface AdminRemoteRequest {
  type: "remote_get";
}

/** Remote origin of a cloned database (`None` when never recorded). */
export interface AdminRemoteResponse {
  data: {
    /** The recorded origin, when present. */
    origin?: RemoteOriginInfo | null;
  };
  type: "remote_origin_result";
}

/** Exports a product primitive to an Arrow-compatible file. */
export interface ArrowExportRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target vector collection for vector exports. */
  collection?: string | null;
  /** Optional event type filter for event exports. */
  event_type?: string | null;
  /** Output file format. */
  format: ArrowFileFormat;
  /** Target graph for graph exports. */
  graph?: string | null;
  /** Optional row limit. */
  limit?: number | null;
  /** Output file path. Graph exports treat this as a stem and return concrete node and edge paths. */
  path: string;
  /** Optional key, document, vector-key, or node-id prefix. */
  prefix?: string | null;
  /** Product primitive to export. */
  primitive: ArrowExportPrimitive;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "arrow_export";
}

/** Arrow export summary. */
export interface ArrowExportResponse {
  data: ArrowExportResult;
  type: "arrow_export_result";
}

/** Imports an Arrow-compatible file into a product primitive. */
export interface ArrowImportRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target vector collection for vector imports. */
  collection?: string | null;
  /** Input file path. */
  file_path: string;
  /** Input file format. Defaults to extension detection. */
  format?: ArrowFileFormat | null;
  /** Target graph for graph imports. */
  graph?: string | null;
  /** Optional key column override. */
  key_column?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Product primitive to import into. */
  target: ArrowImportTarget;
  type: "arrow_import";
  /** Optional value, document, or embedding column override. */
  value_column?: string | null;
}

/** Arrow import summary. */
export interface ArrowImportResponse {
  data: ArrowImportResult;
  type: "arrow_import_result";
}

/** Creates an empty root branch. */
export interface BranchCreateRequest {
  /** Branch name. */
  branch: string;
  type: "branch_create";
}

/** One branch summary. */
export interface BranchCreateResponse {
  data: BranchItem;
  type: "branch";
}

/** Deletes an active branch. */
export interface BranchDeleteRequest {
  /** Branch name. */
  branch: string;
  type: "branch_delete";
}

/** Branch deletion result. */
export interface BranchDeleteResponse {
  data: {
    /** Deleted branch summary. */
    branch: BranchItem;
    /** Cleanup facts. */
    cleanup?: BranchCleanupItem | null;
    /** True when the branch was deleted. */
    deleted: boolean;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Generation after delete. */
    generation_after?: number | null;
    /** Generation before delete. */
    generation_before?: number | null;
  };
  type: "branch_delete_result";
}

/** Forks a branch from the current source head. */
export interface BranchForkRequest {
  /** Destination branch name. */
  branch: string;
  /** Source branch name. */
  source: string;
  type: "branch_fork_current";
}

/** One branch summary. */
export interface BranchForkResponse {
  data: BranchItem;
  type: "branch";
}

/** Forks a branch from a retained source timestamp. */
export interface BranchForkAtTimestampRequest {
  /** Destination branch name. */
  branch: string;
  /** Source branch name. */
  source: string;
  /** Source timestamp in microseconds. */
  timestamp: number;
  type: "branch_fork_at_timestamp";
}

/** One branch summary. */
export interface BranchForkAtTimestampResponse {
  data: BranchItem;
  type: "branch";
}

/** Forks a branch from a retained source version. */
export interface BranchForkAtVersionRequest {
  /** Destination branch name. */
  branch: string;
  /** Source branch name. */
  source: string;
  type: "branch_fork_at_version";
  /** Source version. */
  version: number;
}

/** One branch summary. */
export interface BranchForkAtVersionResponse {
  data: BranchItem;
  type: "branch";
}

/** Reads one branch summary. */
export interface BranchGetRequest {
  /** Branch name. */
  branch: string;
  type: "branch_get";
}

/** One branch summary. */
export interface BranchGetResponse {
  data: BranchItem;
  type: "branch";
}

/** Lists active branches. */
export interface BranchListRequest {
  type: "branch_list";
}

/** Branch list. */
export interface BranchListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Branches in this page. */
    items: BranchItem[];
  };
  type: "branches";
}

/** Appends one event. */
export interface EventAppendRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Event type. */
  event_type: string;
  /** Event payload. */
  payload: unknown;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_append";
}

/** Event append acknowledgement. */
export interface EventAppendResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Appended event type. */
    event_type: string;
    /** Assigned sequence. */
    sequence: number;
  };
  type: "event_append_result";
}

/** Appends multiple events in one engine commit. */
export interface EventBatchAppendRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Events to append. */
  entries: BatchEventEntry[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_batch_append";
}

/** Positional event batch append results. */
export interface EventBatchAppendResponse {
  data: BatchResult9;
  type: "event_batch_append_results";
}

/** Counts visible events. */
export interface EventCountRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_count";
}

/** Event log count. */
export interface EventCountResponse {
  data: {
    /** Visible event count. */
    count: number;
  };
  type: "event_count";
}

/** Checks whether one event sequence exists. */
export interface EventExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Event sequence. */
  sequence: number;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_exists";
}

/** Boolean result. */
export interface EventExistsResponse {
  data: boolean;
  type: "bool";
}

/** Reads one event by sequence. */
export interface EventGetRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Event sequence. */
  sequence: number;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_get";
}

/** Event point-read result: present record with commit metadata, or absence. */
export interface EventGetResponse {
  data: Maybe3;
  type: "event_record";
}

/** Lists events. */
export interface EventListRequest {
  /** Optional exclusive sequence cursor. */
  after_sequence?: number | null;
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional event type filter. */
  event_type?: string | null;
  /** Optional item limit. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_list";
}

/** Event records. */
export interface EventListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: number | null;
    has_more: boolean;
    /** Events in this page. */
    items: EventVersionedData[];
  };
  type: "event_records";
}

/** Reads an event sequence range. */
export interface EventRangeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Result ordering. */
  direction: EventRangeDirection;
  /** Optional exclusive end sequence; with reverse direction, exclusive lower bound. */
  end_seq?: number | null;
  /** Optional event type filter. */
  event_type?: string | null;
  /** Optional item limit. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Inclusive start sequence; with reverse direction, walk backward from this sequence. */
  start_seq: number;
  type: "event_range";
}

/** Paginated event range. */
export interface EventRangeResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: number | null;
    has_more: boolean;
    /** Events in this page. */
    items: EventVersionedData[];
  };
  type: "event_range_result";
}

/** Reads an event timestamp range. */
export interface EventRangeTimeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Result ordering. */
  direction: EventRangeDirection;
  /** Optional inclusive end timestamp in microseconds. */
  end_ts?: number | null;
  /** Optional event type filter. */
  event_type?: string | null;
  /** Optional item limit. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Inclusive start timestamp in microseconds. */
  start_ts: number;
  type: "event_range_by_time";
}

/** Paginated event range. */
export interface EventRangeTimeResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: number | null;
    has_more: boolean;
    /** Events in this page. */
    items: EventVersionedData[];
  };
  type: "event_range_result";
}

/** Lists event types. */
export interface EventTypesRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_list_types";
}

/** Event type list. */
export interface EventTypesResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Event types in this page. */
    items: string[];
  };
  type: "event_type_list";
}

/** Verifies visible event density and hash linkage. */
export interface EventVerifyChainRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "event_verify_chain";
}

/** Event hash-chain verification result. */
export interface EventVerifyChainResponse {
  data: EventChainVerification;
  type: "event_chain_verification";
}

/** Runs a bounded breadth-first traversal from a start node. */
export interface GraphAnalyticsBfsRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional snapshot size bounds. Defaults to the engine limits. */
  budget?: GraphAnalyticsBudget | null;
  /** Optional traversal direction. Defaults to outgoing. */
  direction?: GraphDirection | null;
  /** Optional edge-type restriction applied at every hop. */
  edge_types?: string[] | null;
  /** Graph name. */
  graph: string;
  /** Optional depth bound. Defaults to 100. */
  max_depth?: number | null;
  /** Optional visited-node bound. Defaults to 10000. */
  max_nodes?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Start node id. */
  start: string;
  type: "graph_bfs";
}

/** Breadth-first traversal computed over a graph snapshot. */
export interface GraphAnalyticsBfsResponse {
  data: GraphBfsData;
  type: "graph_bfs_result";
}

/** Detects communities via label propagation. */
export interface GraphAnalyticsCdlpRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional snapshot size bounds. Defaults to the engine limits. */
  budget?: GraphAnalyticsBudget | null;
  /** Optional propagation direction. Defaults to both. */
  direction?: GraphDirection | null;
  /** Graph name. */
  graph: string;
  /** Optional iteration bound. Defaults to 10. */
  max_iterations?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_cdlp";
}

/** Community labels computed over a graph snapshot. */
export interface GraphAnalyticsCdlpResponse {
  data: GraphCdlpData;
  type: "graph_cdlp_result";
}

/** Computes local clustering coefficients over a graph snapshot. */
export interface GraphAnalyticsLccRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional snapshot size bounds. Defaults to the engine limits. */
  budget?: GraphAnalyticsBudget | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_lcc";
}

/** Local clustering coefficients computed over a graph snapshot. */
export interface GraphAnalyticsLccResponse {
  data: GraphLccData;
  type: "graph_lcc_result";
}

/** Computes `PageRank` scores, optionally personalized by seed weights. */
export interface GraphAnalyticsPagerankRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional snapshot size bounds. Defaults to the engine limits. */
  budget?: GraphAnalyticsBudget | null;
  /** Optional damping factor. Defaults to 0.85. */
  damping?: number | null;
  /** Graph name. */
  graph: string;
  /** Optional iteration bound. Defaults to 20. */
  max_iterations?: number | null;
  /**
   * Optional seed weights (node id to weight). When present, both
   * teleport and dangling mass follow the seeds.
   */
  personalization?: {
    [key: string]: number;
  } | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Optional convergence tolerance. Defaults to 1e-6. */
  tolerance?: number | null;
  type: "graph_pagerank";
}

/** `PageRank` scores computed over a graph snapshot. */
export interface GraphAnalyticsPagerankResponse {
  data: GraphPagerankData;
  type: "graph_pagerank_result";
}

/** Computes shortest-path distances from a source node. */
export interface GraphAnalyticsSsspRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional snapshot size bounds. Defaults to the engine limits. */
  budget?: GraphAnalyticsBudget | null;
  /** Optional traversal direction. Defaults to outgoing. */
  direction?: GraphDirection | null;
  /** Graph name. */
  graph: string;
  /** Source node id. */
  source: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_sssp";
}

/** Shortest-path distances computed over a graph snapshot. */
export interface GraphAnalyticsSsspResponse {
  data: GraphSsspData;
  type: "graph_sssp_result";
}

/** Computes weakly connected components over a graph snapshot. */
export interface GraphAnalyticsWccRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional snapshot size bounds. Defaults to the engine limits. */
  budget?: GraphAnalyticsBudget | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_wcc";
}

/** Weakly connected components computed over a graph snapshot. */
export interface GraphAnalyticsWccResponse {
  data: GraphWccData;
  type: "graph_wcc_result";
}

/** Applies an explicit delete policy to graph facts bound to an entity. */
export interface GraphApplyDeletePolicyRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Policy to apply: `cascade`, `detach`, or `keep_dangling`. */
  policy: GraphDeletePolicy;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** The bound entity target. */
  target: GraphBindingTarget;
  type: "graph_apply_delete_policy";
}

/** Delete-policy application acknowledgement. */
export interface GraphApplyDeletePolicyResponse {
  data: {
    /** Commit receipt when rows changed. */
    commit?: CommitReceipt | null;
    /**
     * Mutation effect facts. The number of bound nodes the policy covered
     * is reported by `effect.affected_count`.
     */
    effect: MutationEffect;
    /** Applied policy: `cascade`, `detach`, or `keep_dangling`. */
    policy: string;
  };
  type: "graph_delete_policy_result";
}

/** Applies graph mutations in one engine commit. */
export interface GraphBatchWriteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Batch operations. */
  operations: GraphBatchOperation[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_batch_write";
}

/** Graph batch write acknowledgement. */
export interface GraphBatchWriteResponse {
  /** Shared batch response wrapper for all public batch commands. */
  data: {
    applied: boolean;
    commit?: CommitReceipt | null;
    /** Graph name. */
    graph: string;
    items: BatchItem10[];
    mode: BatchMode;
    status: BatchStatus;
  };
  type: "graph_batch_write_result";
}

/** Lists graph nodes bound to one entity target. */
export interface GraphBindingsRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional exclusive cursor. */
  cursor?: string | null;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Entity target to search for. */
  target: GraphBindingTarget;
  type: "graph_bindings_for_entity";
}

/** Paginated graph binding list. */
export interface GraphBindingsResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Binding hits in this page. */
    items: GraphBindingHit[];
  };
  type: "graph_binding_page";
}

/** Ingests nodes and edges in chunked commits. */
export interface GraphBulkInsertRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /**
   * Optional items-per-commit chunk size. Defaults to 512;
   * values above 800 clamp so one chunk fits one storage commit.
   */
  chunk_size?: number | null;
  /** Edges to upsert; endpoints must exist or arrive in `nodes`. */
  edges?: GraphBulkEdge[];
  /** Graph name. */
  graph: string;
  /** Nodes to upsert (committed before edges). */
  nodes?: GraphBulkNode[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_bulk_insert";
}

/** Bulk ingest acknowledgement. */
export interface GraphBulkInsertResponse {
  data: {
    /** Final chunk's commit receipt, when any chunk committed. */
    commit?: CommitReceipt | null;
    /** How many chunk commits the ingest produced. */
    commits: number;
    /** How many edge upserts the ingest applied. */
    edges_inserted: number;
    /** Graph name. */
    graph: string;
    /** How many node upserts the ingest applied. */
    nodes_inserted: number;
  };
  type: "graph_bulk_insert_result";
}

/** Creates a graph. */
export interface GraphCreateRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_create";
}

/**
 * Graph create acknowledgement carrying the new graph metadata and commit
 * receipt.
 */
export interface GraphCreateResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Created graph metadata. */
    info: GraphInfoData;
  };
  type: "graph_create_result";
}

/** Deletes a graph and its visible graph rows. */
export interface GraphDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_delete";
}

/** Graph delete acknowledgement. */
export interface GraphDeleteResponse {
  data: {
    /** Commit receipt when a delete was applied. */
    commit?: CommitReceipt | null;
    /** Deleted edge destination for edge deletes. */
    dst?: string | null;
    /** Deleted edge type for edge deletes. */
    edge_type?: string | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Deleted node id for node deletes. */
    node_id?: string | null;
    /** Deleted edge source for edge deletes. */
    src?: string | null;
  };
  type: "graph_delete_result";
}

/** Adds or replaces a graph edge. */
export interface GraphEdgeAddRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Destination node id. */
  dst: string;
  /** Edge type. */
  edge_type: string;
  /** Graph name. */
  graph: string;
  /** Optional edge properties. */
  properties?: unknown;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Source node id. */
  src: string;
  type: "graph_add_edge";
  /** Optional edge weight. Defaults to 1.0. */
  weight?: number | null;
}

/** Graph edge write acknowledgement. */
export interface GraphEdgeAddResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Destination node id. */
    dst: string;
    /** Edge type. */
    edge_type: string;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Source node id. */
    src: string;
  };
  type: "graph_edge_write_result";
}

/** Reads a graph edge. */
export interface GraphEdgeGetRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Destination node id. */
  dst: string;
  /** Edge type. */
  edge_type: string;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Source node id. */
  src: string;
  type: "graph_get_edge";
}

/** Graph edge point-read result: present edge, or absence. */
export interface GraphEdgeGetResponse {
  data: Maybe5;
  type: "graph_edge_result";
}

/** Deletes a graph edge. */
export interface GraphEdgeRemoveRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Destination node id. */
  dst: string;
  /** Edge type. */
  edge_type: string;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Source node id. */
  src: string;
  type: "graph_remove_edge";
}

/** Graph delete acknowledgement. */
export interface GraphEdgeRemoveResponse {
  data: {
    /** Commit receipt when a delete was applied. */
    commit?: CommitReceipt | null;
    /** Deleted edge destination for edge deletes. */
    dst?: string | null;
    /** Deleted edge type for edge deletes. */
    edge_type?: string | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Deleted node id for node deletes. */
    node_id?: string | null;
    /** Deleted edge source for edge deletes. */
    src?: string | null;
  };
  type: "graph_delete_result";
}

/** Lists graphs. */
export interface GraphListRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional exclusive graph cursor. */
  cursor?: string | null;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_list";
}

/** Paginated graph name list. */
export interface GraphListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Graphs in this page. */
    items: string[];
  };
  type: "graph_name_page";
}

/** Reads graph metadata. */
export interface GraphMetaRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_get_meta";
}

/** Optional graph metadata. */
export interface GraphMetaResponse {
  data: GraphInfoData | null;
  type: "graph_info_result";
}

/** Lists neighboring graph nodes. */
export interface GraphNeighborsRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional exclusive cursor. */
  cursor?: string | null;
  /** Traversal direction. */
  direction: GraphDirection;
  /** Optional edge type filter. */
  edge_type?: string | null;
  /** Graph name. */
  graph: string;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Node id. */
  node_id: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_neighbors";
}

/** Paginated graph neighbor list. */
export interface GraphNeighborsResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Neighbor hits in this page. */
    items: GraphNeighborHit[];
  };
  type: "graph_neighbor_page";
}

/** Adds or replaces a graph node. */
export interface GraphNodeAddRequest {
  /** Optional entity binding. */
  binding?: GraphEntityBinding | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Node id. */
  node_id: string;
  /** Optional declared object type (validated once the ontology is frozen). */
  object_type?: string | null;
  /** Optional node properties. */
  properties?: unknown;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_add_node";
}

/** Graph node write acknowledgement. */
export interface GraphNodeAddResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Node id. */
    node_id: string;
  };
  type: "graph_node_write_result";
}

/** Reads a graph node. */
export interface GraphNodeGetRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Node id. */
  node_id: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_get_node";
}

/** Graph node point-read result: present node, or absence. */
export interface GraphNodeGetResponse {
  data: Maybe4;
  type: "graph_node_result";
}

/** Lists graph nodes. */
export interface GraphNodeListRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional exclusive node id cursor. */
  cursor?: string | null;
  /** Graph name. */
  graph: string;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Optional node id prefix. */
  prefix?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_list_nodes";
}

/** Paginated graph node list. */
export interface GraphNodeListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Nodes in this page. */
    items: GraphNodeDataOutput[];
  };
  type: "graph_node_page";
}

/** Deletes a graph node and incident edges. */
export interface GraphNodeRemoveRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Node id. */
  node_id: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_remove_node";
}

/** Graph delete acknowledgement. */
export interface GraphNodeRemoveResponse {
  data: {
    /** Commit receipt when a delete was applied. */
    commit?: CommitReceipt | null;
    /** Deleted edge destination for edge deletes. */
    dst?: string | null;
    /** Deleted edge type for edge deletes. */
    edge_type?: string | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Deleted node id for node deletes. */
    node_id?: string | null;
    /** Deleted edge source for edge deletes. */
    src?: string | null;
  };
  type: "graph_delete_result";
}

/** Lists nodes declaring an object type (node-id ordered). */
export interface GraphNodesByTypeRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional exclusive node id cursor. */
  cursor?: string | null;
  /** Graph name. */
  graph: string;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Object type name. */
  object_type: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_nodes_by_type";
}

/** Paginated graph node list. */
export interface GraphNodesByTypeResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Nodes in this page. */
    items: GraphNodeDataOutput[];
  };
  type: "graph_node_page";
}

/** Defines (or, while the ontology is draft, redefines) a link type. */
export interface GraphOntologyDefineLinkTypeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /**
   * Optional cardinality: one of `one-to-one`, `one-to-many`,
   * `many-to-one`, or `many-to-many`. Unknown values are rejected.
   */
  cardinality?: string | null;
  /** Graph name. */
  graph: string;
  /** Link type name. */
  name: string;
  /** Declared properties by name. */
  properties?: {
    [key: string]: GraphPropertyDef;
  };
  /** Declared source object type. */
  source: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Declared target object type. */
  target: string;
  type: "graph_define_link_type";
}

/** Graph ontology type definition acknowledgement. */
export interface GraphOntologyDefineLinkTypeResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Type kind: `object` or `link`. */
    kind: string;
    /** Defined type name. */
    type_name: string;
  };
  type: "graph_ontology_write_result";
}

/** Defines (or, while the ontology is draft, redefines) an object type. */
export interface GraphOntologyDefineObjectTypeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Object type name. */
  name: string;
  /** Declared properties by name. */
  properties?: {
    [key: string]: GraphPropertyDef;
  };
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_define_object_type";
}

/** Graph ontology type definition acknowledgement. */
export interface GraphOntologyDefineObjectTypeResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Type kind: `object` or `link`. */
    kind: string;
    /** Defined type name. */
    type_name: string;
  };
  type: "graph_ontology_write_result";
}

/** Deletes a draft link type. */
export interface GraphOntologyDeleteLinkTypeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Link type name. */
  name: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_delete_link_type";
}

/** Graph ontology type deletion acknowledgement. */
export interface GraphOntologyDeleteLinkTypeResponse {
  data: {
    /** Commit receipt when a row changed. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Type kind: `object` or `link`. */
    kind: string;
    /** Deleted type name. */
    type_name: string;
  };
  type: "graph_ontology_delete_result";
}

/** Deletes a draft object type. */
export interface GraphOntologyDeleteObjectTypeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Object type name. */
  name: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_delete_object_type";
}

/** Graph ontology type deletion acknowledgement. */
export interface GraphOntologyDeleteObjectTypeResponse {
  data: {
    /** Commit receipt when a row changed. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Graph name. */
    graph: string;
    /** Type kind: `object` or `link`. */
    kind: string;
    /** Deleted type name. */
    type_name: string;
  };
  type: "graph_ontology_delete_result";
}

/** Freezes the ontology after validating it; writes then enforce it. */
export interface GraphOntologyFreezeRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_freeze_ontology";
}

/** Graph ontology freeze acknowledgement. */
export interface GraphOntologyFreezeResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Graph name. */
    graph: string;
    /** Frozen link type count. */
    link_types: number;
    /** Frozen object type count. */
    object_types: number;
  };
  type: "graph_ontology_freeze_result";
}

/** Reads the graph's ontology (status plus every declared type). */
export interface GraphOntologyGetRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_get_ontology";
}

/** Graph ontology read result (`None` before any type is defined). */
export interface GraphOntologyGetResponse {
  data: GraphOntologyData | null;
  type: "graph_ontology_result";
}

/** Reads the ontology with per-type node and edge usage counts. */
export interface GraphOntologySummaryRequest {
  /** Optional timestamp in microseconds. Reads the graph state visible at that instant. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_ontology_summary";
}

/** Graph ontology summary result with per-type usage counts. */
export interface GraphOntologySummaryResponse {
  data: GraphOntologySummaryData | null;
  type: "graph_ontology_summary_result";
}

/** Samples graph nodes. */
export interface GraphSampleRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional sample count. Defaults to 10. */
  count?: number | null;
  /** Graph name. */
  graph: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "graph_sample";
}

/** Sampled graph nodes. */
export interface GraphSampleResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Sampled nodes. */
    items: GraphNodeDataOutput[];
    /** Total live nodes in the graph. */
    total_count: number;
  };
  type: "graph_sample_result";
}

/** Returns inference runtime cache diagnostics. */
export interface InferenceCacheStatusRequest {
  type: "inference_cache_status";
}

/** Inference runtime cache diagnostics. */
export interface InferenceCacheStatusResponse {
  data: ModelCacheStatus;
  type: "inference_cache_status";
}

/** Returns capability facts for one inference model spec. */
export interface InferenceCapabilityRequest {
  /** Model spec. */
  model: string;
  type: "inference_model_capability";
}

/** Inference capability facts. */
export interface InferenceCapabilityResponse {
  data: InferenceCapability;
  type: "inference_capability";
}

/** Detokenizes token ids with a local inference model. */
export interface InferenceDetokenizeRequest {
  /** Token ids. */
  ids: number[];
  /** Model spec. */
  model: string;
  type: "inference_detokenize";
}

/** Inference detokenized text. */
export interface InferenceDetokenizeResponse {
  data: string;
  type: "inference_text";
}

/** Embeds one or more texts with an inference model. */
export interface InferenceEmbedRequest {
  /** Model spec. */
  model: string;
  /** Embedding request. */
  request: EmbeddingsRequest;
  type: "inference_embed";
}

/** Inference embedding output. */
export interface InferenceEmbedResponse {
  data: EmbeddingsResponse;
  type: "inference_embeddings";
}

/** Generates text with an inference model. */
export interface InferenceGenerateRequest {
  /** Model spec. */
  model: string;
  /** Generation request. */
  request: ChatRequest;
  type: "inference_generate";
}

/** Inference generation output. */
export interface InferenceGenerateResponse {
  data: ChatResponse;
  type: "inference_generation";
}

/** Lists catalog models known to the inference runtime. */
export interface InferenceModelsListRequest {
  type: "inference_models_list";
}

/** Inference model list. */
export interface InferenceModelsListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Models in this page. */
    items: ModelInfo[];
  };
  type: "inference_models";
}

/** Lists locally available inference models. */
export interface InferenceModelsLocalRequest {
  type: "inference_models_local";
}

/** Inference model list. */
export interface InferenceModelsLocalResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Models in this page. */
    items: ModelInfo[];
  };
  type: "inference_models";
}

/** Pulls an inference model into the local model directory. */
export interface InferenceModelsPullRequest {
  /** Model spec or catalog name. */
  model: string;
  type: "inference_models_pull";
}

/** Inference model pull output. */
export interface InferenceModelsPullResponse {
  data: PullModelOutput;
  type: "inference_model_pulled";
}

/** Ranks passages against a query with an inference model. */
export interface InferenceRankRequest {
  /** Model spec. */
  model: string;
  /** Ranking request. */
  request: RankRequest;
  type: "inference_rank";
}

/** Inference ranking output. */
export interface InferenceRankResponse {
  data: RankResponse;
  type: "inference_ranking";
}

/** Tokenizes text with a local inference model. */
export interface InferenceTokenizeRequest {
  /** Whether to add special tokens. */
  add_special?: boolean;
  /** Model spec. */
  model: string;
  /** Text to tokenize. */
  text: string;
  type: "inference_tokenize";
}

/** Inference token ids. */
export interface InferenceTokenizeResponse {
  data: number[];
  type: "inference_token_ids";
}

/** Unloads one cached inference model, or all cached models when omitted. */
export interface InferenceUnloadRequest {
  /** Optional model spec. */
  model?: string | null;
  type: "inference_unload";
}

/** Inference unload result. */
export interface InferenceUnloadResponse {
  data: {
    /** True when a cached entry was removed. */
    unloaded: boolean;
  };
  type: "inference_unload_result";
}

/** Deletes multiple JSON documents or paths. */
export interface JsonBatchDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Entries to delete. */
  entries: BatchJsonDeleteEntry[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_batch_delete";
}

/** Positional JSON batch write/delete results. */
export interface JsonBatchDeleteResponse {
  data: BatchResult3;
  type: "json_batch_results";
}

/** Batch-checks JSON document existence. */
export interface JsonBatchExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Document keys to check. */
  keys: string[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_batch_exists";
}

/** JSON batch document-existence results. */
export interface JsonBatchExistsResponse {
  data: BatchResult6;
  type: "json_batch_exists_results";
}

/** Reads multiple JSON values. */
export interface JsonBatchGetRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Entries to read. */
  entries: BatchJsonGetEntry[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_batch_get";
}

/** Positional JSON batch read results. */
export interface JsonBatchGetResponse {
  data: BatchResult4;
  type: "json_batch_get_results";
}

/** Sets multiple JSON values in one engine commit. */
export interface JsonBatchSetRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Entries to set. */
  entries: BatchJsonEntry[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_batch_set";
}

/** Positional JSON batch write/delete results. */
export interface JsonBatchSetResponse {
  data: BatchResult3;
  type: "json_batch_results";
}

/** Counts JSON documents. */
export interface JsonCountRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional document key prefix. */
  prefix?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_count";
}

/** Unsigned integer result. */
export interface JsonCountResponse {
  data: number;
  type: "uint";
}

/** Deletes a whole JSON document or one JSON path. */
export interface JsonDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Document key. */
  key: string;
  /** JSON path. */
  path: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_delete";
}

/**
 * JSON document delete acknowledgement.
 *
 * The echoed document id is a `String`, mirroring
 * [`JsonWriteResult`](Self::JsonWriteResult).
 */
export interface JsonDeleteResponse {
  data: {
    /** Commit receipt when a delete was applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Target document id. */
    key: string;
  };
  type: "json_delete_result";
}

/** Checks whether a JSON document exists. */
export interface JsonExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Document key. */
  key: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_exists";
}

/** Boolean result. */
export interface JsonExistsResponse {
  data: boolean;
  type: "bool";
}

/** Reads a JSON value at a document path. */
export interface JsonGetRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Document key. */
  key: string;
  /** JSON path. */
  path: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_get";
}

/** Optional JSON value with commit metadata. */
export interface JsonGetResponse {
  data: MaybeJsonVersionedValue;
  type: "json_versioned_value";
}

/** Reads full JSON document version history. */
export interface JsonHistoryRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Document key. */
  key: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_history";
}

/** Full JSON document version history. */
export interface JsonHistoryResponse {
  data: JsonHistoryItem[] | null;
  type: "json_version_history";
}

/** Creates a JSON secondary index. */
export interface JsonIndexCreateRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Indexed field path. */
  field_path: string;
  /** Index kind. */
  index_type: JsonIndexType;
  /** Index name. */
  name: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_create_index";
}

/** JSON secondary index definition. */
export interface JsonIndexCreateResponse {
  data: JsonIndexDefinition;
  type: "json_index_definition";
}

/** Drops a JSON secondary index. */
export interface JsonIndexDropRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Index name. */
  name: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_drop_index";
}

/** Boolean result. */
export interface JsonIndexDropResponse {
  data: boolean;
  type: "bool";
}

/** Lists JSON secondary indexes. */
export interface JsonIndexListRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_list_indexes";
}

/** JSON secondary index definitions. */
export interface JsonIndexListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Indexes in this page. */
    items: JsonIndexDefinition[];
  };
  type: "json_index_list";
}

/**
 * Lists JSON document keys.
 *
 * # Guaranteed semantics
 *
 * - **Ordering.** Keys are returned in ascending byte-lexicographic
 *   order, stable across calls for unchanged data.
 * - **Cursor.** The returned cursor is the last key of a non-terminal
 *   page; resuming lists strictly *after* that key. Cursors are plain
 *   positions: they stay valid indefinitely, across interleaved writes,
 *   and even if the cursor document itself is deleted. A key is never
 *   returned twice for the same cursor chain.
 * - **Interleaved writes.** Each page reads the latest committed state
 *   unless `as_of` is set: documents created behind the cursor position
 *   do not appear; documents created or deleted ahead of it are
 *   reflected in later pages. For a snapshot-stable enumeration across
 *   pages, pass the same `as_of` timestamp on every page.
 * - **Termination.** The terminal page reports `has_more: false` and
 *   `cursor: null`. A `limit` of zero returns an empty terminal page.
 */
export interface JsonListRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional document key cursor. */
  cursor?: string | null;
  /** Optional item limit. */
  limit?: number | null;
  /** Optional document key prefix. */
  prefix?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_list";
}

/** Paginated JSON document key list. */
export interface JsonListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Keys in this page. */
    items: string[];
  };
  type: "json_list_result";
}

/** Samples JSON documents. */
export interface JsonSampleRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional sample count. Defaults to 10. */
  count?: number | null;
  /** Optional document key prefix. */
  prefix?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_sample";
}

/** Sampled JSON documents. */
export interface JsonSampleResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Sampled documents. */
    items: JsonSampleItem[];
    /** Total matching live documents. */
    total_count: number;
  };
  type: "json_sample_result";
}

/** Scans JSON documents. */
export interface JsonScanRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional row limit. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Optional inclusive start document key. */
  start?: string | null;
  type: "json_scan";
}

/** JSON document scan page. */
export interface JsonScanResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Documents in this page. */
    items: JsonSampleItem[];
  };
  type: "json_scan_result";
}

/** Sets a JSON value at a document path, creating the document when missing. */
export interface JsonSetRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Document key. */
  key: string;
  /** JSON path. */
  path: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "json_set";
  /** JSON value. */
  value: unknown;
}

/**
 * JSON document write acknowledgement.
 *
 * JSON document ids are textual, so the echoed key is a `String` rather
 * than the `Bytes` used by the KV [`WriteResult`](Self::WriteResult)
 * envelope (DSGN-5/DTO-2).
 */
export interface JsonSetResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Written document id. */
    key: string;
  };
  type: "json_write_result";
}

/** Deletes multiple KV entries in one engine commit. */
export interface KvBatchDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Keys to delete. */
  keys: Bytes[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_batch_delete";
}

/** Positional batch write/delete results. */
export interface KvBatchDeleteResponse {
  data: BatchResult;
  type: "batch_results";
}

/** Checks multiple keys for existence. */
export interface KvBatchExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Keys to check. */
  keys: Bytes[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_batch_exists";
}

/** Positional batch existence results. */
export interface KvBatchExistsResponse {
  data: BatchResult5;
  type: "batch_exists_results";
}

/** Reads multiple KV entries. */
export interface KvBatchGetRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Keys to read. */
  keys: Bytes[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_batch_get";
}

/** Positional batch read results. */
export interface KvBatchGetResponse {
  data: BatchResult2;
  type: "batch_get_results";
}

/** Writes multiple KV entries in one engine commit. */
export interface KvBatchPutRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Entries to write. */
  entries: BatchKvEntry[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_batch_put";
}

/** Positional batch write/delete results. */
export interface KvBatchPutResponse {
  data: BatchResult;
  type: "batch_results";
}

/** Counts keys. */
export interface KvCountRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional key prefix. */
  prefix?: Bytes | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_count";
}

/** Unsigned integer result. */
export interface KvCountResponse {
  data: number;
  type: "uint";
}

/** Deletes one KV entry. */
export interface KvDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Key bytes. */
  key: Bytes;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_delete";
}

/** Delete acknowledgement. */
export interface KvDeleteResponse {
  data: {
    /** Commit receipt when a delete was applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Target key. */
    key: Bytes;
  };
  type: "delete_result";
}

/** Checks one key for existence. */
export interface KvExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Key to check. */
  key: Bytes;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_exists";
}

/** Boolean result. */
export interface KvExistsResponse {
  data: boolean;
  type: "bool";
}

/** Reads one KV entry. */
export interface KvGetRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Key bytes. */
  key: Bytes;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_get";
}

/** KV point-read result: present value with commit metadata, or absence. */
export interface KvGetResponse {
  data: Maybe;
  type: "kv_versioned_value";
}

/** Reads full version history for one key. */
export interface KvHistoryRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Key to read. */
  key: Bytes;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_history";
}

/** Full version history for one key. */
export interface KvHistoryResponse {
  data: HistoryResult | null;
  type: "version_history";
}

/** Lists KV keys. */
export interface KvListRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional key cursor. */
  cursor?: Bytes | null;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Optional key prefix. */
  prefix?: Bytes | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_list";
}

/**
 * Key list.
 *
 * A non-paginated list returns a terminal page (`has_more: false`,
 * `cursor: null`); a paginated list carries the continuation cursor.
 */
export interface KvListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: Bytes | null;
    has_more: boolean;
    /** Keys in this page. */
    items: Bytes[];
  };
  type: "keys_page";
}

/**
 * Writes one KV entry.
 *
 * # Guaranteed semantics
 *
 * - **Atomic per key.** The write is a single engine commit: it either
 *   applies fully (value plus a new commit version) or not at all. No
 *   reader ever observes a partial or torn value.
 * - **Read-after-write visibility.** Once the command returns success,
 *   every subsequent read through any handle of the same database
 *   observes this write (or a newer one) — including immediately, from
 *   the handle that issued it. Acknowledged writes are never
 *   transiently invisible.
 */
export interface KvPutRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Key bytes. */
  key: Bytes;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_put";
  /** Value bytes. */
  value: Bytes;
}

/** Write acknowledgement. */
export interface KvPutResponse {
  data: {
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Written key. */
    key: Bytes;
  };
  type: "write_result";
}

/** Samples keys and values. */
export interface KvSampleRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional sample count. Defaults to 10. */
  count?: number | null;
  /** Optional key prefix. */
  prefix?: Bytes | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "kv_sample";
}

/** Sampled KV result. */
export interface KvSampleResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: Bytes | null;
    has_more: boolean;
    /** Sampled rows. */
    items: SampleItem[];
    /** Total matching live rows. */
    total_count: number;
  };
  type: "sample_result";
}

/** Scans KV rows. */
export interface KvScanRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Optional row limit. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Optional inclusive start key. */
  start?: Bytes | null;
  type: "kv_scan";
}

/** KV scan result. */
export interface KvScanResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: Bytes | null;
    has_more: boolean;
    /** Rows in this page. */
    items: ScanItem[];
  };
  type: "kv_scan_result";
}

/**
 * Creates a product space for a branch.
 *
 * # Guaranteed semantics
 *
 * - **Idempotent success.** Creating a space that already exists is not
 *   an error: the command succeeds with `created: false` and no mutation
 *   effect. `created: true` is reported only by the call that first
 *   materialized the space.
 * - **Immediate visibility.** Once the command returns success, the
 *   space is visible to every subsequent command on any handle of the
 *   same database — `SpaceExists` reports `true` and data commands
 *   targeting the space are accepted.
 */
export interface SpaceCreateRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Product space name. */
  space: string;
  type: "space_create";
}

/** Product space create result. */
export interface SpaceCreateResponse {
  data: {
    /** Commit receipt when a catalog mutation was applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Product space name. */
    space: string;
  };
  type: "space_create_result";
}

/** Deletes a product space from a branch. */
export interface SpaceDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Delete visible data in the space before dropping the catalog entry. */
  force?: boolean;
  /** Product space name. */
  space: string;
  type: "space_delete";
}

/** Product space delete result. */
export interface SpaceDeleteResponse {
  data: {
    /** Commit receipt when a catalog mutation was applied. */
    commit?: CommitReceipt | null;
    /** Number of visible space rows tombstoned, including primitive index/control rows. */
    deleted_rows: number;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** True when visible space data was force-deleted. */
    force: boolean;
    /** Product space name. */
    space: string;
  };
  type: "space_delete_result";
}

/** Checks whether a product space exists for a branch. */
export interface SpaceExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Product space name. */
  space: string;
  type: "space_exists";
}

/** Boolean result. */
export interface SpaceExistsResponse {
  data: boolean;
  type: "bool";
}

/** Lists product spaces for a branch. */
export interface SpaceListRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  type: "space_list";
}

/** Product space list. */
export interface SpaceListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Spaces in this page. */
    items: string[];
  };
  type: "space_list";
}

/** Deletes multiple vectors. */
export interface VectorBatchDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Keys to delete. */
  keys: string[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_batch_delete";
}

/** Positional vector batch delete results. */
export interface VectorBatchDeleteResponse {
  data: BatchResult7;
  type: "vector_batch_delete_results";
}

/** Batch-checks vector key existence. */
export interface VectorBatchExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector keys to check. */
  keys: string[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_batch_exists";
}

/** Vector batch key-existence results. */
export interface VectorBatchExistsResponse {
  data: BatchResult6;
  type: "vector_batch_exists_results";
}

/** Reads multiple vectors. */
export interface VectorBatchGetRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Keys to read. */
  keys: string[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_batch_get";
}

/** Positional vector batch read results. */
export interface VectorBatchGetResponse {
  data: BatchResult8;
  type: "vector_batch_get_results";
}

/** Upserts multiple vectors. */
export interface VectorBatchUpsertRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Entries to write. */
  entries: BatchVectorEntry[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_batch_upsert";
}

/** Positional vector batch write results. */
export interface VectorBatchUpsertResponse {
  data: BatchResult7;
  type: "vector_batch_upsert_results";
}

/** Creates a vector collection. */
export interface VectorCollectionCreateRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Embedding dimension. */
  dimension: number;
  /** Distance metric. */
  metric: VectorDistanceMetric;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_create_collection";
}

/** Vector collection list. */
export interface VectorCollectionCreateResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Collections in this page. */
    items: VectorCollectionInfo[];
  };
  type: "vector_collection_list";
}

/** Deletes a vector collection. */
export interface VectorCollectionDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_delete_collection";
}

/** Boolean result. */
export interface VectorCollectionDeleteResponse {
  data: boolean;
  type: "bool";
}

/** Lists vector collections. */
export interface VectorCollectionListRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_list_collections";
}

/** Vector collection list. */
export interface VectorCollectionListResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Collections in this page. */
    items: VectorCollectionInfo[];
  };
  type: "vector_collection_list";
}

/** Reads vector collection facts. */
export interface VectorCollectionStatsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_collection_stats";
}

/** Vector collection list. */
export interface VectorCollectionStatsResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Collections in this page. */
    items: VectorCollectionInfo[];
  };
  type: "vector_collection_list";
}

/** Counts visible vectors in one collection. */
export interface VectorCountRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_count";
}

/** Unsigned integer result. */
export interface VectorCountResponse {
  data: number;
  type: "uint";
}

/** Deletes one vector. */
export interface VectorDeleteRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector key. */
  key: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_delete";
}

/** Vector delete acknowledgement. */
export interface VectorDeleteResponse {
  data: {
    /** Collection name. */
    collection: string;
    /** Commit receipt when a delete was applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Vector key. */
    key: string;
  };
  type: "vector_delete_result";
}

/** Deletes all visible vectors in one collection. */
export interface VectorDeleteAllRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_delete_all";
}

/** Vector bulk delete acknowledgement. */
export interface VectorDeleteAllResponse {
  data: {
    /** Collection name. */
    collection: string;
    /** Commit receipt when deletes were applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
  };
  type: "vector_bulk_delete_result";
}

/** Deletes vectors matching a metadata filter. */
export interface VectorDeleteByFilterRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Metadata filter. */
  filter: VectorMetadataFilter;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_delete_by_filter";
}

/** Vector bulk delete acknowledgement. */
export interface VectorDeleteByFilterResponse {
  data: {
    /** Collection name. */
    collection: string;
    /** Commit receipt when deletes were applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
  };
  type: "vector_bulk_delete_result";
}

/** Checks whether one vector exists. */
export interface VectorExistsRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector key. */
  key: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_exists";
}

/** Boolean result. */
export interface VectorExistsResponse {
  data: boolean;
  type: "bool";
}

/** Reads one vector. */
export interface VectorGetRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector key. */
  key: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_get";
}

/** Vector point-read result: present value with commit metadata, or absence. */
export interface VectorGetResponse {
  data: Maybe2;
  type: "vector_data";
}

/** Reads full vector history. */
export interface VectorHistoryRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector key. */
  key: string;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_history";
}

/** Full vector history. */
export interface VectorHistoryResponse {
  data: VectorHistoryResult | null;
  type: "vector_version_history";
}

/** Runs vector search and returns index planner diagnostics. */
export interface VectorIndexQueryRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Optional metadata filter. */
  filter?: VectorMetadataFilter | null;
  /** Maximum number of matches. */
  k: number;
  /**
   * Query embedding. Accepted at wire (f64) precision and narrowed to the
   * searched f32; a value that underflows or overflows f32 is rejected.
   */
  query: number[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_index_query";
}

/** Vector search matches plus index planner diagnostics. */
export interface VectorIndexQueryResponse {
  data: VectorIndexQueryResult;
  type: "vector_index_query";
}

/** Lists vector keys. */
export interface VectorKeysRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Optional key cursor. */
  cursor?: string | null;
  /** Optional item limit. Defaults to 100. */
  limit?: number | null;
  /** Optional key prefix. */
  prefix?: string | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_list_keys";
}

/** Paginated vector key list. */
export interface VectorKeysResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Keys in this page. */
    items: string[];
  };
  type: "vector_key_page";
}

/** Updates vector metadata. */
export interface VectorMetadataUpdateRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector key. */
  key: string;
  /** Top-level metadata patch. */
  patch: unknown;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_update_metadata";
}

/** Vector metadata update acknowledgement. */
export interface VectorMetadataUpdateResponse {
  data: {
    /** Collection name. */
    collection: string;
    /** Commit receipt when an update was applied. */
    commit?: CommitReceipt | null;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Vector key. */
    key: string;
    /** Product vector revision when an update was applied. */
    vector_revision?: number | null;
  };
  type: "vector_metadata_update_result";
}

/** Runs vector search with the default engine planner. */
export interface VectorQueryRequest {
  /** Optional timestamp in microseconds. */
  as_of?: number | null;
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Optional metadata filter. */
  filter?: VectorMetadataFilter | null;
  /** Maximum number of matches. */
  k: number;
  /**
   * Query embedding. Accepted at wire (f64) precision and narrowed to the
   * searched f32; a value that underflows or overflows f32 is rejected.
   */
  query: number[];
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_query";
}

/** Vector search matches. */
export interface VectorQueryResponse {
  data: VectorMatch[];
  type: "vector_matches";
}

/** Samples vectors. */
export interface VectorSampleRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Optional sample count. Defaults to 10. */
  count?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_sample";
}

/** Sampled vectors. */
export interface VectorSampleResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Sampled vectors. */
    items: VectorVersionedData[];
    /** Total live vectors in the collection. */
    total_count: number;
  };
  type: "vector_sample_result";
}

/** Scans vectors. */
export interface VectorScanRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Optional row limit. */
  limit?: number | null;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  /** Optional inclusive start key. */
  start?: string | null;
  type: "vector_scan";
}

/** Vector scan page. */
export interface VectorScanResponse {
  /** Shared pagination continuation facts. */
  data: {
    cursor?: string | null;
    has_more: boolean;
    /** Vectors in this page. */
    items: VectorVersionedData[];
  };
  type: "vector_scan_result";
}

/** Upserts one vector. */
export interface VectorUpsertRequest {
  /** Target branch. Defaults to the executor handle branch. */
  branch?: string | null;
  /** Collection name. */
  collection: string;
  /** Vector key. */
  key: string;
  /** Optional metadata. */
  metadata?: unknown;
  /** Target product space. Defaults to `"default"`. */
  space?: string | null;
  type: "vector_upsert";
  /**
   * Dense embedding. Accepted at wire (f64) precision and narrowed to the
   * stored f32; a value that underflows or overflows f32 is rejected.
   */
  vector: number[];
}

/** Vector write acknowledgement. */
export interface VectorUpsertResponse {
  data: {
    /** Collection name. */
    collection: string;
    /** Commit receipt. */
    commit: CommitReceipt;
    /** Mutation effect facts. */
    effect: MutationEffect;
    /** Vector key. */
    key: string;
    /** Product vector revision. */
    vector_revision: number;
  };
  type: "vector_write_result";
}

/** Request payload type per command id — the typed spine of the wire client (AR-2). */
export interface CommandRequests {
  "admin.config": AdminConfigRequest;
  "admin.config_key": AdminConfigKeyRequest;
  "admin.describe": AdminDescribeRequest;
  "admin.health": AdminHealthRequest;
  "admin.hub_clone": AdminHubCloneRequest;
  "admin.info": AdminInfoRequest;
  "admin.ipc_status": AdminIpcStatusRequest;
  "admin.ipc_stop": AdminIpcStopRequest;
  "admin.metrics": AdminMetricsRequest;
  "admin.ping": AdminPingRequest;
  "admin.remote": AdminRemoteRequest;
  "arrow.export": ArrowExportRequest;
  "arrow.import": ArrowImportRequest;
  "branch.create": BranchCreateRequest;
  "branch.delete": BranchDeleteRequest;
  "branch.fork": BranchForkRequest;
  "branch.fork_at_timestamp": BranchForkAtTimestampRequest;
  "branch.fork_at_version": BranchForkAtVersionRequest;
  "branch.get": BranchGetRequest;
  "branch.list": BranchListRequest;
  "event.append": EventAppendRequest;
  "event.batch_append": EventBatchAppendRequest;
  "event.count": EventCountRequest;
  "event.exists": EventExistsRequest;
  "event.get": EventGetRequest;
  "event.list": EventListRequest;
  "event.range": EventRangeRequest;
  "event.range_time": EventRangeTimeRequest;
  "event.types": EventTypesRequest;
  "event.verify_chain": EventVerifyChainRequest;
  "graph.analytics.bfs": GraphAnalyticsBfsRequest;
  "graph.analytics.cdlp": GraphAnalyticsCdlpRequest;
  "graph.analytics.lcc": GraphAnalyticsLccRequest;
  "graph.analytics.pagerank": GraphAnalyticsPagerankRequest;
  "graph.analytics.sssp": GraphAnalyticsSsspRequest;
  "graph.analytics.wcc": GraphAnalyticsWccRequest;
  "graph.apply_delete_policy": GraphApplyDeletePolicyRequest;
  "graph.batch_write": GraphBatchWriteRequest;
  "graph.bindings": GraphBindingsRequest;
  "graph.bulk_insert": GraphBulkInsertRequest;
  "graph.create": GraphCreateRequest;
  "graph.delete": GraphDeleteRequest;
  "graph.edge.add": GraphEdgeAddRequest;
  "graph.edge.get": GraphEdgeGetRequest;
  "graph.edge.remove": GraphEdgeRemoveRequest;
  "graph.list": GraphListRequest;
  "graph.meta": GraphMetaRequest;
  "graph.neighbors": GraphNeighborsRequest;
  "graph.node.add": GraphNodeAddRequest;
  "graph.node.get": GraphNodeGetRequest;
  "graph.node.list": GraphNodeListRequest;
  "graph.node.remove": GraphNodeRemoveRequest;
  "graph.nodes_by_type": GraphNodesByTypeRequest;
  "graph.ontology.define_link_type": GraphOntologyDefineLinkTypeRequest;
  "graph.ontology.define_object_type": GraphOntologyDefineObjectTypeRequest;
  "graph.ontology.delete_link_type": GraphOntologyDeleteLinkTypeRequest;
  "graph.ontology.delete_object_type": GraphOntologyDeleteObjectTypeRequest;
  "graph.ontology.freeze": GraphOntologyFreezeRequest;
  "graph.ontology.get": GraphOntologyGetRequest;
  "graph.ontology.summary": GraphOntologySummaryRequest;
  "graph.sample": GraphSampleRequest;
  "inference.cache_status": InferenceCacheStatusRequest;
  "inference.capability": InferenceCapabilityRequest;
  "inference.detokenize": InferenceDetokenizeRequest;
  "inference.embed": InferenceEmbedRequest;
  "inference.generate": InferenceGenerateRequest;
  "inference.models.list": InferenceModelsListRequest;
  "inference.models.local": InferenceModelsLocalRequest;
  "inference.models.pull": InferenceModelsPullRequest;
  "inference.rank": InferenceRankRequest;
  "inference.tokenize": InferenceTokenizeRequest;
  "inference.unload": InferenceUnloadRequest;
  "json.batch_delete": JsonBatchDeleteRequest;
  "json.batch_exists": JsonBatchExistsRequest;
  "json.batch_get": JsonBatchGetRequest;
  "json.batch_set": JsonBatchSetRequest;
  "json.count": JsonCountRequest;
  "json.delete": JsonDeleteRequest;
  "json.exists": JsonExistsRequest;
  "json.get": JsonGetRequest;
  "json.history": JsonHistoryRequest;
  "json.index.create": JsonIndexCreateRequest;
  "json.index.drop": JsonIndexDropRequest;
  "json.index.list": JsonIndexListRequest;
  "json.list": JsonListRequest;
  "json.sample": JsonSampleRequest;
  "json.scan": JsonScanRequest;
  "json.set": JsonSetRequest;
  "kv.batch_delete": KvBatchDeleteRequest;
  "kv.batch_exists": KvBatchExistsRequest;
  "kv.batch_get": KvBatchGetRequest;
  "kv.batch_put": KvBatchPutRequest;
  "kv.count": KvCountRequest;
  "kv.delete": KvDeleteRequest;
  "kv.exists": KvExistsRequest;
  "kv.get": KvGetRequest;
  "kv.history": KvHistoryRequest;
  "kv.list": KvListRequest;
  "kv.put": KvPutRequest;
  "kv.sample": KvSampleRequest;
  "kv.scan": KvScanRequest;
  "space.create": SpaceCreateRequest;
  "space.delete": SpaceDeleteRequest;
  "space.exists": SpaceExistsRequest;
  "space.list": SpaceListRequest;
  "vector.batch_delete": VectorBatchDeleteRequest;
  "vector.batch_exists": VectorBatchExistsRequest;
  "vector.batch_get": VectorBatchGetRequest;
  "vector.batch_upsert": VectorBatchUpsertRequest;
  "vector.collection.create": VectorCollectionCreateRequest;
  "vector.collection.delete": VectorCollectionDeleteRequest;
  "vector.collection.list": VectorCollectionListRequest;
  "vector.collection.stats": VectorCollectionStatsRequest;
  "vector.count": VectorCountRequest;
  "vector.delete": VectorDeleteRequest;
  "vector.delete_all": VectorDeleteAllRequest;
  "vector.delete_by_filter": VectorDeleteByFilterRequest;
  "vector.exists": VectorExistsRequest;
  "vector.get": VectorGetRequest;
  "vector.history": VectorHistoryRequest;
  "vector.index.query": VectorIndexQueryRequest;
  "vector.keys": VectorKeysRequest;
  "vector.metadata.update": VectorMetadataUpdateRequest;
  "vector.query": VectorQueryRequest;
  "vector.sample": VectorSampleRequest;
  "vector.scan": VectorScanRequest;
  "vector.upsert": VectorUpsertRequest;
}

/** Response payload type per command id. */
export interface CommandResponses {
  "admin.config": AdminConfigResponse;
  "admin.config_key": AdminConfigKeyResponse;
  "admin.describe": AdminDescribeResponse;
  "admin.health": AdminHealthResponse;
  "admin.hub_clone": AdminHubCloneResponse;
  "admin.info": AdminInfoResponse;
  "admin.ipc_status": AdminIpcStatusResponse;
  "admin.ipc_stop": AdminIpcStopResponse;
  "admin.metrics": AdminMetricsResponse;
  "admin.ping": AdminPingResponse;
  "admin.remote": AdminRemoteResponse;
  "arrow.export": ArrowExportResponse;
  "arrow.import": ArrowImportResponse;
  "branch.create": BranchCreateResponse;
  "branch.delete": BranchDeleteResponse;
  "branch.fork": BranchForkResponse;
  "branch.fork_at_timestamp": BranchForkAtTimestampResponse;
  "branch.fork_at_version": BranchForkAtVersionResponse;
  "branch.get": BranchGetResponse;
  "branch.list": BranchListResponse;
  "event.append": EventAppendResponse;
  "event.batch_append": EventBatchAppendResponse;
  "event.count": EventCountResponse;
  "event.exists": EventExistsResponse;
  "event.get": EventGetResponse;
  "event.list": EventListResponse;
  "event.range": EventRangeResponse;
  "event.range_time": EventRangeTimeResponse;
  "event.types": EventTypesResponse;
  "event.verify_chain": EventVerifyChainResponse;
  "graph.analytics.bfs": GraphAnalyticsBfsResponse;
  "graph.analytics.cdlp": GraphAnalyticsCdlpResponse;
  "graph.analytics.lcc": GraphAnalyticsLccResponse;
  "graph.analytics.pagerank": GraphAnalyticsPagerankResponse;
  "graph.analytics.sssp": GraphAnalyticsSsspResponse;
  "graph.analytics.wcc": GraphAnalyticsWccResponse;
  "graph.apply_delete_policy": GraphApplyDeletePolicyResponse;
  "graph.batch_write": GraphBatchWriteResponse;
  "graph.bindings": GraphBindingsResponse;
  "graph.bulk_insert": GraphBulkInsertResponse;
  "graph.create": GraphCreateResponse;
  "graph.delete": GraphDeleteResponse;
  "graph.edge.add": GraphEdgeAddResponse;
  "graph.edge.get": GraphEdgeGetResponse;
  "graph.edge.remove": GraphEdgeRemoveResponse;
  "graph.list": GraphListResponse;
  "graph.meta": GraphMetaResponse;
  "graph.neighbors": GraphNeighborsResponse;
  "graph.node.add": GraphNodeAddResponse;
  "graph.node.get": GraphNodeGetResponse;
  "graph.node.list": GraphNodeListResponse;
  "graph.node.remove": GraphNodeRemoveResponse;
  "graph.nodes_by_type": GraphNodesByTypeResponse;
  "graph.ontology.define_link_type": GraphOntologyDefineLinkTypeResponse;
  "graph.ontology.define_object_type": GraphOntologyDefineObjectTypeResponse;
  "graph.ontology.delete_link_type": GraphOntologyDeleteLinkTypeResponse;
  "graph.ontology.delete_object_type": GraphOntologyDeleteObjectTypeResponse;
  "graph.ontology.freeze": GraphOntologyFreezeResponse;
  "graph.ontology.get": GraphOntologyGetResponse;
  "graph.ontology.summary": GraphOntologySummaryResponse;
  "graph.sample": GraphSampleResponse;
  "inference.cache_status": InferenceCacheStatusResponse;
  "inference.capability": InferenceCapabilityResponse;
  "inference.detokenize": InferenceDetokenizeResponse;
  "inference.embed": InferenceEmbedResponse;
  "inference.generate": InferenceGenerateResponse;
  "inference.models.list": InferenceModelsListResponse;
  "inference.models.local": InferenceModelsLocalResponse;
  "inference.models.pull": InferenceModelsPullResponse;
  "inference.rank": InferenceRankResponse;
  "inference.tokenize": InferenceTokenizeResponse;
  "inference.unload": InferenceUnloadResponse;
  "json.batch_delete": JsonBatchDeleteResponse;
  "json.batch_exists": JsonBatchExistsResponse;
  "json.batch_get": JsonBatchGetResponse;
  "json.batch_set": JsonBatchSetResponse;
  "json.count": JsonCountResponse;
  "json.delete": JsonDeleteResponse;
  "json.exists": JsonExistsResponse;
  "json.get": JsonGetResponse;
  "json.history": JsonHistoryResponse;
  "json.index.create": JsonIndexCreateResponse;
  "json.index.drop": JsonIndexDropResponse;
  "json.index.list": JsonIndexListResponse;
  "json.list": JsonListResponse;
  "json.sample": JsonSampleResponse;
  "json.scan": JsonScanResponse;
  "json.set": JsonSetResponse;
  "kv.batch_delete": KvBatchDeleteResponse;
  "kv.batch_exists": KvBatchExistsResponse;
  "kv.batch_get": KvBatchGetResponse;
  "kv.batch_put": KvBatchPutResponse;
  "kv.count": KvCountResponse;
  "kv.delete": KvDeleteResponse;
  "kv.exists": KvExistsResponse;
  "kv.get": KvGetResponse;
  "kv.history": KvHistoryResponse;
  "kv.list": KvListResponse;
  "kv.put": KvPutResponse;
  "kv.sample": KvSampleResponse;
  "kv.scan": KvScanResponse;
  "space.create": SpaceCreateResponse;
  "space.delete": SpaceDeleteResponse;
  "space.exists": SpaceExistsResponse;
  "space.list": SpaceListResponse;
  "vector.batch_delete": VectorBatchDeleteResponse;
  "vector.batch_exists": VectorBatchExistsResponse;
  "vector.batch_get": VectorBatchGetResponse;
  "vector.batch_upsert": VectorBatchUpsertResponse;
  "vector.collection.create": VectorCollectionCreateResponse;
  "vector.collection.delete": VectorCollectionDeleteResponse;
  "vector.collection.list": VectorCollectionListResponse;
  "vector.collection.stats": VectorCollectionStatsResponse;
  "vector.count": VectorCountResponse;
  "vector.delete": VectorDeleteResponse;
  "vector.delete_all": VectorDeleteAllResponse;
  "vector.delete_by_filter": VectorDeleteByFilterResponse;
  "vector.exists": VectorExistsResponse;
  "vector.get": VectorGetResponse;
  "vector.history": VectorHistoryResponse;
  "vector.index.query": VectorIndexQueryResponse;
  "vector.keys": VectorKeysResponse;
  "vector.metadata.update": VectorMetadataUpdateResponse;
  "vector.query": VectorQueryResponse;
  "vector.sample": VectorSampleResponse;
  "vector.scan": VectorScanResponse;
  "vector.upsert": VectorUpsertResponse;
}
