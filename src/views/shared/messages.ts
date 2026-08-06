/**
 * The typed message protocol between the extension host and the F4 webviews
 * (E8). Vscode-free and browser-safe — imported by both sides. Data crossing
 * this boundary is already shaped for display: decoding happens extension-
 * side (Buffer lives there), and float payloads are summarized before they
 * ever reach a view (F4.4 discipline).
 */

export type ViewKind = "kv" | "json" | "events" | "vectors" | "graph";

/** Every view states its scope honestly (F4.6). */
export interface ViewScope {
  dbPath: string;
  branch: string;
  space: string;
  asOfMicros: number | null;
  /** Human rendering of the scrub position, or null when live. */
  asOfLabel: string | null;
}

// --------------------------------------------------------------------------
// View → extension requests
// --------------------------------------------------------------------------

export type ViewOp =
  | { op: "kv-page"; start?: string | null }
  | { op: "kv-value"; key: string }
  | { op: "kv-history"; key: string }
  | { op: "json-page"; cursor?: string | null }
  | { op: "json-doc"; docId: string }
  | { op: "json-doc-at"; docId: string; asOfMicros: number }
  | { op: "json-history"; docId: string }
  | { op: "json-indexes" }
  | { op: "event-head"; beforeSeq?: number | null; eventType?: string | null }
  | { op: "event-types" }
  | { op: "verify-chain" }
  | { op: "vector-collections" }
  | { op: "vector-page"; collection: string; cursor?: string | null }
  | { op: "vector-history"; collection: string; key: string }
  | { op: "graph-names" }
  | { op: "graph-ontology"; graph: string }
  | { op: "graph-seed"; graph: string; count: number }
  | { op: "graph-neighbors"; graph: string; nodeId: string; limit: number }
  | { op: "graph-node"; graph: string; nodeId: string }
  | { op: "graph-analytics"; graph: string; algorithm: "pagerank" | "wcc" }
  | { op: "scrub"; micros: number | null }
  | { op: "open-docs"; code: string };

export interface ViewRequestMsg {
  kind: "request";
  reqId: number;
  payload: ViewOp;
}

export type ViewToExt = ViewRequestMsg;

// --------------------------------------------------------------------------
// Extension → view messages
// --------------------------------------------------------------------------

export interface ViewErrorShape {
  class: string;
  code: string;
  message: string;
  /** F2.5: retention errors render as states, not failures. */
  retention: boolean;
}

export type ExtToView =
  | { kind: "init"; view: ViewKind; scope: ViewScope; focus?: string }
  | { kind: "response"; reqId: number; ok: true; data: unknown }
  | { kind: "response"; reqId: number; ok: false; error: ViewErrorShape }
  | { kind: "refresh"; scope: ViewScope };

// --------------------------------------------------------------------------
// Shaped payloads (what `data` carries per op)
// --------------------------------------------------------------------------

export interface KvPageData {
  items: Array<{ keyB64: string; label: string; preview: string; version: number | null }>;
  cursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export interface KvValueData {
  found: boolean;
  version: number | null;
  timestamp: number | null;
  text: string | null;
  json: unknown | null;
  hex: string;
  byteLength: number;
}

export interface TimelineData {
  kind: "timeline" | "unavailable";
  reason?: string;
  entries: Array<{ version: number; timestamp: number; tombstone: boolean; preview: string | null }>;
}

export interface JsonPageData {
  items: string[];
  cursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export interface JsonDocData {
  found: boolean;
  value: unknown;
}

export interface EventPageData {
  /** Ascending by sequence; the feed renders newest at the bottom (F4.3). */
  items: Array<{
    sequence: number;
    version: number;
    timestamp: number;
    eventType: string;
    payload: unknown;
    hash: string;
    previousHash: string;
  }>;
  /** Sequence to pass as beforeSeq to page further back, or null at the start. */
  earlier: number | null;
  total: number | null;
}

export interface ChainVerificationData {
  valid: boolean;
  length: number;
  firstInvalid: number | null;
  error: string | null;
}

export interface VectorCollectionsData {
  items: Array<{ name: string; dimension: number; metric: string; count: number }>;
}

export interface VectorPageData {
  collection: string;
  items: Array<{
    key: string;
    version: number;
    timestamp: number;
    dimension: number;
    /** L2 norm, summarized extension-side — floats never cross raw (F4.4). */
    norm: number;
    metadataPreview: string | null;
  }>;
  cursor: string | null;
  hasMore: boolean;
}

export interface GraphNamesData {
  names: string[];
}

export interface GraphOntologyData {
  status: string;
  objectTypes: Array<{ name: string; count: number | null }>;
  linkTypes: Array<{ name: string; count: number | null }>;
}

export interface GraphNodeShape {
  id: string;
  nodeType: string | null;
  propsPreview: string | null;
}

export interface GraphEdgeShape {
  src: string;
  dst: string;
  edgeType: string;
}

export interface GraphExpandData {
  nodes: GraphNodeShape[];
  edges: GraphEdgeShape[];
  /** True when the expansion hit its fan-out bound (no silent caps, F4.6). */
  truncated: boolean;
}

export interface GraphNodeDetailData {
  found: boolean;
  id: string;
  nodeType: string | null;
  properties: unknown;
  bindings: unknown;
}

export interface GraphAnalyticsData {
  algorithm: string;
  /** node id → score (pagerank) or component id (wcc). */
  scores: Record<string, number>;
  cancelled?: boolean;
}
