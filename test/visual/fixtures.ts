/**
 * Fixture data for the visual matrix (U1) — the same "agent memory" story
 * the seeded demo database tells, shaped exactly as ViewDataService would
 * ship it. Timestamps are fixed (2026-08-05T14:00Z base) so screenshots are
 * deterministic.
 */
import type { ViewScope } from "../../src/views/shared/messages";

/** micros at minute offsets from the fixed base instant. */
function t(minutes: number): number {
  return (Date.UTC(2026, 7, 5, 14, 0, 0) + minutes * 60_000) * 1000;
}

function hex64(seed: string): string {
  return seed.repeat(Math.ceil(64 / seed.length)).slice(0, 64);
}

export type StateName = "populated" | "empty" | "loading" | "error" | "scrubbed";

export const LIVE_SCOPE: ViewScope = {
  dbPath: "/Users/ada/agents/agent.strata",
  branch: "default",
  space: "default",
  asOfMicros: null,
  asOfLabel: null,
};

export const SCRUBBED_SCOPE: ViewScope = {
  ...LIVE_SCOPE,
  asOfMicros: t(12),
  asOfLabel: "Aug 5, 2026, 14:12:00",
};

export const ERROR_ENVELOPE = {
  class: "transport",
  code: "transport.connection_lost",
  message: "the owner closed the connection mid-request",
  retention: false,
};

// --------------------------------------------------------------------------
// Populated responses, keyed by op
// --------------------------------------------------------------------------

const missionText = "write the report";

export const POPULATED: Record<string, unknown> = {
  "kv-page": {
    items: [
      { keyB64: btoa("mission"), label: "mission", preview: missionText, version: 3 },
      { keyB64: btoa("model"), label: "model", preview: "claude-fable-5", version: 1 },
      { keyB64: btoa("temperature"), label: "temperature", preview: "0.2", version: 1 },
      { keyB64: btoa("last-checkpoint"), label: "last-checkpoint", preview: "step-12", version: 12 },
      { keyB64: btoa("session-id"), label: "session-id", preview: "s-4c21", version: 1 },
      { keyB64: btoa("tokens-used"), label: "tokens-used", preview: "48213", version: 12 },
      { keyB64: btoa("budget"), label: "budget", preview: "100000", version: 1 },
      { keyB64: btoa("owner"), label: "owner", preview: "ada", version: 1 },
    ],
    cursor: null,
    hasMore: true,
    total: 124,
  },
  "kv-value": {
    found: true,
    version: 3,
    timestamp: t(41),
    text: missionText,
    json: null,
    hex: Buffer.from(missionText, "utf8").toString("hex"),
    byteLength: Buffer.byteLength(missionText, "utf8"),
  },
  "kv-history": {
    kind: "timeline",
    entries: [
      { version: 3, timestamp: t(41), tombstone: false, preview: missionText },
      { version: 2, timestamp: t(18), tombstone: false, preview: "summarize findings" },
      { version: 1, timestamp: t(0), tombstone: false, preview: "explore the dataset" },
    ],
  },
  "json-page": { items: ["task:report", "user:ada", "user:grace"], cursor: null, hasMore: false, total: 3 },
  "json-doc": {
    found: true,
    value: {
      title: "Latency analysis",
      status: "review",
      owner: "ada",
      findings: [
        "p99 regressions cluster on cold caches",
        "retry storms amplify tail latency",
      ],
      reviewer: "grace",
    },
  },
  "json-doc-at": {
    found: true,
    value: { title: "Latency analysis", status: "draft", owner: "ada", findings: [] },
  },
  "json-history": {
    kind: "timeline",
    entries: [
      { version: 2, timestamp: t(41), tombstone: false, preview: null },
      { version: 1, timestamp: t(3), tombstone: false, preview: null },
    ],
  },
  "json-indexes": { status: { kind: "hash", entries: 3 } },
  "event-head": {
    items: [
      { sequence: 6, version: 7, timestamp: t(20), eventType: "tool.call", payload: { tool: "search", query: "p99 latency" }, hash: hex64("6a1f"), previousHash: hex64("5e0d") },
      { sequence: 7, version: 8, timestamp: t(22), eventType: "agent.step", payload: { thought: "cold caches correlate with the spikes" }, hash: hex64("7b2e"), previousHash: hex64("6a1f") },
      { sequence: 8, version: 9, timestamp: t(25), eventType: "tool.call", payload: { tool: "read_metrics", range: "24h" }, hash: hex64("8c3d"), previousHash: hex64("7b2e") },
      { sequence: 9, version: 10, timestamp: t(28), eventType: "agent.step", payload: { thought: "retry storms amplify the tail" }, hash: hex64("9d4c"), previousHash: hex64("8c3d") },
      { sequence: 10, version: 11, timestamp: t(31), eventType: "tool.call", payload: { tool: "draft", section: "findings" }, hash: hex64("a5eb"), previousHash: hex64("9d4c") },
      { sequence: 11, version: 12, timestamp: t(35), eventType: "agent.step", payload: { thought: "draft ready for review" }, hash: hex64("b6fa"), previousHash: hex64("a5eb") },
      { sequence: 12, version: 13, timestamp: t(38), eventType: "tool.call", payload: { tool: "handoff", to: "grace" }, hash: hex64("c709"), previousHash: hex64("b6fa") },
      { sequence: 13, version: 14, timestamp: t(41), eventType: "agent.done", payload: { outcome: "report in review" }, hash: hex64("d818"), previousHash: hex64("c709") },
    ],
    earlier: 5,
    total: 14,
  },
  "event-types": ["agent.start", "agent.step", "tool.call", "agent.done"],
  "verify-chain": { valid: true, length: 14, firstInvalid: null, error: null },
  "vector-collections": {
    items: [
      { name: "memories", dimension: 4, metric: "cosine", count: 3 },
      { name: "scratch", dimension: 8, metric: "l2", count: 0 },
    ],
  },
  "vector-page": {
    collection: "memories",
    items: [
      { key: "mem:0001", version: 1, timestamp: t(5), dimension: 4, norm: 0.9873, metadataPreview: `{"topic":"latency"}` },
      { key: "mem:0002", version: 2, timestamp: t(19), dimension: 4, norm: 1.0, metadataPreview: `{"topic":"caches"}` },
      { key: "mem:0003", version: 1, timestamp: t(33), dimension: 4, norm: 0.4142, metadataPreview: null },
    ],
    cursor: null,
    hasMore: false,
  },
  "vector-history": {
    kind: "timeline",
    entries: [
      { version: 2, timestamp: t(19), tombstone: false, preview: null },
      { version: 1, timestamp: t(4), tombstone: false, preview: null },
    ],
  },
  "graph-names": { names: ["knowledge"] },
  "graph-ontology": {
    status: "complete",
    objectTypes: [
      { name: "person", count: 2 },
      { name: "finding", count: 2 },
      { name: "artifact", count: 1 },
      { name: "tool", count: 1 },
    ],
    linkTypes: [
      { name: "authored", count: 2 },
      { name: "cites", count: 2 },
      { name: "used", count: 1 },
    ],
  },
  "graph-seed": {
    nodes: [
      { id: "ada", nodeType: "person", propsPreview: `{"role":"researcher"}` },
      { id: "grace", nodeType: "person", propsPreview: `{"role":"reviewer"}` },
      { id: "finding:latency", nodeType: "finding", propsPreview: null },
      { id: "report:q3", nodeType: "artifact", propsPreview: null },
      { id: "search", nodeType: "tool", propsPreview: null },
    ],
    edges: [
      { src: "ada", dst: "finding:latency", edgeType: "authored" },
      { src: "finding:latency", dst: "report:q3", edgeType: "cites" },
      { src: "grace", dst: "report:q3", edgeType: "authored" },
      { src: "ada", dst: "search", edgeType: "used" },
    ],
    truncated: false,
  },
  "graph-neighbors": {
    nodes: [
      { id: "finding:retries", nodeType: "finding", propsPreview: null },
      { id: "note:coldcache", nodeType: "artifact", propsPreview: null },
    ],
    edges: [
      { src: "ada", dst: "finding:retries", edgeType: "authored" },
      { src: "finding:retries", dst: "note:coldcache", edgeType: "cites" },
    ],
    truncated: true,
  },
  "graph-node": {
    found: true,
    id: "ada",
    nodeType: "person",
    properties: { role: "researcher", joined: "2026-06-01" },
    bindings: { kv: ["owner"] },
  },
  "graph-analytics": {
    algorithm: "pagerank",
    scores: {
      ada: 0.31,
      grace: 0.18,
      "finding:latency": 0.22,
      "report:q3": 0.19,
      search: 0.1,
    },
  },
};

export const EMPTY: Record<string, unknown> = {
  "kv-page": { items: [], cursor: null, hasMore: false, total: 0 },
  "json-page": { items: [], cursor: null, hasMore: false, total: 0 },
  "json-indexes": null,
  "event-head": { items: [], earlier: null, total: 0 },
  "event-types": [],
  "vector-collections": { items: [] },
  "graph-names": { names: [] },
};
