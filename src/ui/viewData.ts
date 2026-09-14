/**
 * The extension-side data service behind every F4 view (E8): handles the
 * typed ViewOps over the interactive client, shaping wire records for
 * display. All the F4 disciplines live here — capped pages, as_of on every
 * read that takes it, float payloads summarized (never dumped), bounded
 * neighborhood expansion (whole-graph pulls are structurally impossible:
 * no code path issues an unbounded traversal), and retention errors marked
 * as states (F2.5). Vscode-free and fully testable against the fake owner.
 */
import type { InteractiveClient } from "../wire/client";
import { CommandFailedError } from "../wire/errors";
import { asWireBase64, decodeBytes, encodeUtf8, type WireBase64 } from "../wire/bytes";
import { StrataCliCommandError } from "../cli/run";
import { decodeValue, keyLabel } from "../explorer/decode";
import { kvTimeline, jsonTimeline } from "../explorer/history";
import type {
  ChainVerificationData,
  EventPageData,
  GraphAnalyticsData,
  GraphExpandData,
  GraphNodeDetailData,
  GraphNamesData,
  GraphOntologyData,
  JsonDocData,
  JsonPageData,
  KvPageData,
  KvValueData,
  SpaceFilter,
  SpaceItem,
  SpacePageData,
  TimelineData,
  VectorCollectionsData,
  VectorPageData,
  ViewErrorShape,
  ViewOp,
  ViewScope,
  ViewWriteOp,
  WriteResultData,
} from "../views/shared/messages";

export const VIEW_PAGE_SIZE = 100;
/** F4.5: adjacency expansion is bounded — depth is one click, fan-out this. */
export const GRAPH_FANOUT_LIMIT = 50;
export const GRAPH_SEED_COUNT = 10;

export class ViewDataService {
  constructor(
    private readonly client: InteractiveClient,
    /** F3.4 reuse: analytics confirmation is injected by the host layer. */
    private readonly confirmExpensive: (label: string) => Promise<boolean> = async () => true,
    private readonly write: ((scope: ViewScope, op: ViewWriteOp) => Promise<WriteResultData>) | null = null,
  ) {}

  async handle(scope: ViewScope, op: ViewOp): Promise<unknown> {
    const context = { branch: scope.branch, space: scope.space };
    const asOf = scope.asOfMicros;
    const withAsOf = <T extends Record<string, unknown>>(payload: T): T =>
      asOf !== null ? { ...payload, as_of: asOf } : payload;
    const base = { branch: scope.branch, space: scope.space };

    switch (op.op) {
      case "space-page":
        return this.spacePage(scope, op.filter, op.cursor ?? null, op.query ?? null);

      case "kv-page": {
        const cursor = cursorB64(op.start);
        const prefix = startTextB64(op.startText);
        const page = await this.client.request(
          "kv.list",
          withAsOf({
            ...base,
            limit: VIEW_PAGE_SIZE,
            cursor,
            ...(prefix ? { prefix } : {}),
          }),
          context,
        );
        const total = await this.client
          .request("kv.count", withAsOf({ ...base, ...(prefix ? { prefix } : {}) }), context)
          .then((r) => r.data)
          .catch(() => null);
        return {
          items: page.data.items.map((key) => ({
            keyB64: key,
            label: keyLabel(key),
            preview: prefix ? "Prefix match - select to inspect" : "Select to inspect",
            version: null,
          })),
          cursor: page.data.cursor ?? null,
          hasMore: page.data.has_more,
          total,
        } satisfies KvPageData;
      }

      case "kv-value": {
        const got = await this.client.request(
          "kv.get",
          withAsOf({ ...base, key: asWireBase64(op.key) }),
          context,
        );
        if (!got.data.found || !got.data.value) {
          return { found: false, version: null, timestamp: null, committedAt: null, text: null, json: null, hex: "", byteLength: 0 } satisfies KvValueData;
        }
        const decoded = decodeValue(got.data.value.value);
        const bytes = decodeBytes(got.data.value.value);
        const valueWithMaybeCommittedAt = got.data.value as typeof got.data.value & { committed_at?: number | null };
        return {
          found: true,
          version: got.data.value.version,
          timestamp: got.data.value.timestamp,
          committedAt: valueWithMaybeCommittedAt.committed_at ?? null,
          text: decoded.form === "text" ? decoded.display : null,
          json: decoded.form === "json" ? JSON.parse(decoded.display) : null,
          hex: Buffer.from(bytes).toString("hex"),
          byteLength: bytes.length,
        } satisfies KvValueData;
      }

      case "kv-history":
        return shapeTimeline(await kvTimeline(this.client, scopeOf(scope), asWireBase64(op.key)));

      case "kv-put-key":
      case "kv-put-text":
      case "json-set":
        if (!this.write) throw new Error("Writes are unavailable in this view.");
        return this.write(scope, op);

      case "json-page": {
        const page = await this.client.request(
          "json.list",
          withAsOf({ ...base, limit: VIEW_PAGE_SIZE, cursor: op.cursor ?? null }),
          context,
        );
        const total = await this.client
          .request("json.count", withAsOf(base), context)
          .then((r) => r.data)
          .catch(() => null);
        return {
          items: page.data.items,
          cursor: page.data.cursor ?? null,
          hasMore: page.data.has_more,
          total,
        } satisfies JsonPageData;
      }

      case "json-doc": {
        const got = await this.client.request(
          "json.get",
          withAsOf({ ...base, key: op.docId, path: "$" }),
          context,
        );
        return unwrapJsonDoc(got.data) satisfies JsonDocData;
      }

      case "json-doc-at": {
        // The two-version diff (F4.2): an explicit historical read.
        const got = await this.client.request(
          "json.get",
          { ...base, key: op.docId, path: "$", as_of: op.asOfMicros },
          context,
        );
        return unwrapJsonDoc(got.data) satisfies JsonDocData;
      }

      case "json-history":
        return shapeTimeline(await jsonTimeline(this.client, scopeOf(scope), op.docId));

      case "json-indexes": {
        const got = await this.client.request("json.index.list", base, context);
        return got.data;
      }

      case "event-head": {
        // Newest at the bottom, paged backward from the head (F4.3): a
        // bounded forward range over the final visible window.
        const total = await this.client
          .request("event.count", withAsOf(base), context)
          .then((r) => r.data.count)
          .catch(() => null);
        if (total === null || total <= 0) {
          return { items: [], earlier: null, total } satisfies EventPageData;
        }
        const endExclusive = Math.min(op.beforeSeq !== undefined && op.beforeSeq !== null ? op.beforeSeq + 1 : total, total);
        if (endExclusive <= 0) return { items: [], earlier: null, total } satisfies EventPageData;
        const startSeq = Math.max(0, endExclusive - VIEW_PAGE_SIZE);
        const page = await this.client.request(
          "event.range",
          {
            ...base,
            start_seq: startSeq,
            end_seq: endExclusive,
            direction: "forward",
            limit: endExclusive - startSeq,
            event_type: op.eventType ?? null,
          },
          context,
        );
        const ascending = [...page.data.items].sort((a, b) => a.event.sequence - b.event.sequence);
        return {
          items: ascending.map((item) => ({
            sequence: item.event.sequence,
            version: item.version,
            commitTimestamp: item.timestamp,
            timestamp: item.event.timestamp,
            eventType: item.event.event_type,
            payload: item.event.payload,
            hash: item.event.hash,
            previousHash: item.event.previous_hash,
          })),
          earlier: startSeq > 0 ? startSeq - 1 : null,
          total,
        } satisfies EventPageData;
      }

      case "event-types": {
        const got = await this.client.request("event.types", withAsOf(base), context);
        return got.data;
      }

      case "verify-chain": {
        const got = await this.client.request("event.verify_chain", base, context);
        return {
          valid: got.data.valid,
          length: got.data.length,
          firstInvalid: got.data.first_invalid ?? null,
          error: got.data.error ?? null,
        } satisfies ChainVerificationData;
      }

      case "vector-collections": {
        const got = await this.client.request("vector.collection.list", withAsOf(base), context);
        return {
          items: got.data.items.map((info) => ({
            name: info.name,
            dimension: info.dimension,
            metric: String(info.metric),
            count: info.count,
          })),
        } satisfies VectorCollectionsData;
      }

      case "vector-page": {
        const page = await this.client.request(
          "vector.scan",
          { ...base, collection: op.collection, limit: VIEW_PAGE_SIZE, start: op.cursor ?? null },
          context,
        );
        return {
          collection: op.collection,
          items: page.data.items.map((item) => ({
            key: item.key,
            version: item.version,
            timestamp: item.timestamp,
            // F4.4: float payloads are summarized, never dumped.
            dimension: item.data.embedding.length,
            norm: l2norm(item.data.embedding),
            metadataPreview:
              item.data.metadata !== undefined && item.data.metadata !== null
                ? JSON.stringify(item.data.metadata).slice(0, 120)
                : null,
          })),
          cursor: page.data.cursor ?? null,
          hasMore: page.data.has_more,
        } satisfies VectorPageData;
      }

      case "vector-history": {
        const got = await this.client.request(
          "vector.history",
          { ...base, collection: op.collection, key: op.key },
          context,
        );
        const items = got.data?.items ?? [];
        return {
          kind: "timeline",
          entries: items.map((item: { version: number; timestamp: number; committed_at?: number | null; tombstone?: boolean }) => ({
            version: item.version,
            timestamp: item.timestamp,
            committedAt: item.committed_at ?? null,
            tombstone: item.tombstone ?? false,
            preview: null,
          })),
        } satisfies TimelineData;
      }

      case "graph-names": {
        const got = await this.client.request(
          "graph.list",
          withAsOf({ ...base, limit: VIEW_PAGE_SIZE }),
          context,
        );
        return { names: got.data.items.map(String) } satisfies GraphNamesData;
      }

      case "graph-ontology": {
        const got = await this.client.request(
          "graph.ontology.summary",
          withAsOf({ ...base, graph: op.graph }),
          context,
        );
        const data = got.data;
        return {
          status: data?.status ?? "unknown",
          objectTypes: (data?.object_types ?? []).map((t) => ({
            name: nameOf(t),
            count: countOf(t),
          })),
          linkTypes: (data?.link_types ?? []).map((t) => ({ name: nameOf(t), count: countOf(t) })),
        } satisfies GraphOntologyData;
      }

      case "graph-seed": {
        const got = await this.client.request(
          "graph.sample",
          { ...base, graph: op.graph, count: Math.min(op.count, GRAPH_SEED_COUNT) },
          context,
        );
        const nodes = (asRecords(got.data) ?? []).map((n) => shapeNode(n));
        return { nodes, edges: [], truncated: false } satisfies GraphExpandData;
      }

      case "graph-neighbors": {
        const limit = Math.min(op.limit, GRAPH_FANOUT_LIMIT);
        const got = await this.client.request(
          "graph.neighbors",
          withAsOf({
            ...base,
            graph: op.graph,
            node_id: op.nodeId,
            direction: "both" as const,
            limit,
          }),
          context,
        );
        const nodes = new Map<string, ReturnType<typeof shapeNode>>();
        const edges: GraphExpandData["edges"] = [];
        for (const hit of got.data.items) {
          nodes.set(hit.node_id, shapeNode({ id: hit.node_id, ...(hit.node as object) }));
          edges.push({ src: hit.src, dst: hit.dst, edgeType: hit.edge_type });
        }
        return {
          nodes: [...nodes.values()],
          edges,
          truncated: got.data.has_more,
        } satisfies GraphExpandData;
      }

      case "graph-node": {
        const got = await this.client.request(
          "graph.node.get",
          withAsOf({ ...base, graph: op.graph, node_id: op.nodeId }),
          context,
        );
        const record = got.data as { found: boolean; value?: unknown };
        const value = (record.value ?? {}) as Record<string, unknown>;
        return {
          found: record.found,
          id: op.nodeId,
          nodeType: typeof value.node_type === "string" ? value.node_type : null,
          properties: value.properties ?? value,
          bindings: value.binding ?? null,
        } satisfies GraphNodeDetailData;
      }

      case "graph-analytics": {
        // F3.4 reuse: expensive analytics gate on the host's confirmation.
        const confirmed = await this.confirmExpensive(
          `graph.analytics.${op.algorithm} on "${op.graph}"`,
        );
        if (!confirmed) {
          return { algorithm: op.algorithm, scores: {}, cancelled: true } satisfies GraphAnalyticsData;
        }
        if (op.algorithm === "pagerank") {
          const got = await this.client.request(
            "graph.analytics.pagerank",
            { ...base, graph: op.graph },
            context,
          );
          return { algorithm: "pagerank", scores: got.data.ranks } satisfies GraphAnalyticsData;
        }
        const got = await this.client.request(
          "graph.analytics.wcc",
          { ...base, graph: op.graph },
          context,
        );
        // WCC labels components with strings; colorization wants numbers —
        // map each component label to a stable first-seen index.
        const components = (got.data as unknown as { components?: Record<string, string> }).components ?? {};
        const indexByLabel = new Map<string, number>();
        const scores: Record<string, number> = {};
        for (const [nodeId, label] of Object.entries(components)) {
          if (!indexByLabel.has(label)) indexByLabel.set(label, indexByLabel.size);
          scores[nodeId] = indexByLabel.get(label)!;
        }
        return { algorithm: "wcc", scores } satisfies GraphAnalyticsData;
      }

      case "scrub":
        // Handled by the host layer (it owns the view context); reaching the
        // service is a wiring bug.
        throw new Error("scrub is a host-level op");
    }
  }

  private async spacePage(
    scope: ViewScope,
    filter: SpaceFilter,
    cursor: string | null,
    query: string | null,
  ): Promise<SpacePageData> {
    if (filter === "all") {
      const pages = await Promise.allSettled(
        (["kv", "json", "events", "vectors", "graphs"] as const).map((kind) =>
          this.spacePage(scope, kind, null, query),
        ),
      );
      const items: SpaceItem[] = [];
      const notes: string[] = [];
      let total = 0;
      let totalKnown = true;
      for (const page of pages) {
        if (page.status === "fulfilled") {
          items.push(...page.value.items);
          if (page.value.total === null) totalKnown = false;
          else total += page.value.total;
          notes.push(...page.value.notes);
        } else {
          notes.push(page.reason instanceof Error ? page.reason.message : String(page.reason));
          totalKnown = false;
        }
      }
      return {
        items: filterSpaceItems(items, query),
        cursor: null,
        hasMore: false,
        total: totalKnown ? total : null,
        notes,
      };
    }

    switch (filter) {
      case "kv": {
        const page = await this.handle(scope, { op: "kv-page", start: cursor, startText: query }) as KvPageData;
        return {
          items: page.items.map((item) => ({
            id: `kv:${item.keyB64}`,
            kind: "kv",
            label: item.label,
            preview: item.preview,
            meta: "Key-Value",
            version: item.version,
            timestamp: null,
            keyB64: item.keyB64,
          })),
          cursor: page.cursor,
          hasMore: page.hasMore,
          total: page.total,
          notes: [],
        };
      }

      case "json": {
        const page = await this.handle(scope, { op: "json-page", cursor }) as JsonPageData;
        return {
          items: filterSpaceItems(
            page.items.map((docId) => ({
              id: `json:${docId}`,
              kind: "json" as const,
              label: docId,
              preview: "Document",
              meta: "Document",
              version: null,
              timestamp: null,
              docId,
            })),
            query,
          ),
          cursor: page.cursor,
          hasMore: page.hasMore,
          total: page.total,
          notes: [],
        };
      }

      case "events": {
        const page = await this.handle(scope, {
          op: "event-head",
          beforeSeq: cursor !== null ? Number(cursor) : null,
        }) as EventPageData;
        return {
          items: filterSpaceItems(
            page.items.map((item) => ({
              id: `event:${item.sequence}`,
              kind: "event" as const,
              label: item.eventType,
              preview: previewUnknown(item.payload),
              meta: `Event #${item.sequence}`,
              version: item.version,
              timestamp: item.timestamp,
              event: {
                sequence: item.sequence,
                eventType: item.eventType,
                payload: item.payload,
                hash: item.hash,
                previousHash: item.previousHash,
              },
            })),
            query,
          ),
          cursor: page.earlier === null ? null : String(page.earlier),
          hasMore: page.earlier !== null,
          total: page.total,
          notes: [],
        };
      }

      case "vectors": {
        const data = await this.handle(scope, { op: "vector-collections" }) as VectorCollectionsData;
        const items = data.items.map((collection) => ({
          id: `vector:${collection.name}`,
          kind: "vector-collection" as const,
          label: collection.name,
          preview: `${collection.count} vectors · ${collection.dimension}d · ${collection.metric}`,
          meta: "Vector collection",
          version: null,
          timestamp: null,
          collection: collection.name,
        }));
        return {
          items: filterSpaceItems(items, query),
          cursor: null,
          hasMore: false,
          total: items.length,
          notes: [],
        };
      }

      case "graphs": {
        const data = await this.handle(scope, { op: "graph-names" }) as GraphNamesData;
        const items = data.names.map((graph) => ({
          id: `graph:${graph}`,
          kind: "graph" as const,
          label: graph,
          preview: "Graph",
          meta: "Graph",
          version: null,
          timestamp: null,
          graph,
        }));
        return {
          items: filterSpaceItems(items, query),
          cursor: null,
          hasMore: false,
          total: items.length,
          notes: [],
        };
      }
    }
  }
}

/** Maps errors to the view error shape, marking retention states (F2.5). */
export function shapeViewError(error: unknown): ViewErrorShape {
  if (error instanceof CommandFailedError) {
    return {
      class: error.errorClass,
      code: error.code,
      message: error.message,
      retention: error.errorClass === "history_unavailable",
    };
  }
  if (error instanceof StrataCliCommandError) {
    return {
      class: error.details.errorClass,
      code: error.details.code,
      message: error.details.message,
      retention: false,
    };
  }
  return {
    class: "unknown",
    code: "client.view_request_failed",
    message: error instanceof Error ? error.message : String(error),
    retention: false,
  };
}

/** json.get wraps the document in a versioned envelope: {value: {value: doc, …}}. */
function unwrapJsonDoc(data: { found: boolean; value?: unknown }): JsonDocData {
  if (!data.found) return { found: false, value: null };
  const envelope = data.value as { value?: unknown; document_version?: unknown } | null;
  const isEnvelope =
    envelope !== null &&
    typeof envelope === "object" &&
    "value" in envelope &&
    "document_version" in envelope;
  return { found: true, value: isEnvelope ? envelope.value : data.value };
}

function scopeOf(scope: ViewScope): { dbPath: string; branch: string; space: string } {
  return { dbPath: scope.dbPath, branch: scope.branch, space: scope.space };
}

function cursorB64(value: string | null | undefined): WireBase64 | null {
  return value == null ? null : asWireBase64(value);
}

function startTextB64(value: string | null | undefined): WireBase64 | null {
  const trimmed = value?.trim();
  return trimmed ? encodeUtf8(trimmed) : null;
}

function filterSpaceItems<T extends SpaceItem>(items: T[], query: string | null): T[] {
  const needle = query?.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    [item.kind, item.label, item.preview, item.meta]
      .some((field) => field.toLowerCase().includes(needle)),
  );
}

function previewUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return clipOneLine(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return clipOneLine(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function clipOneLine(value: string): string {
  const oneLine = value.replace(/\s+/g, " ");
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}...` : oneLine;
}

function shapeTimeline(timeline: Awaited<ReturnType<typeof kvTimeline>>): TimelineData {
  if (timeline.kind === "unavailable") {
    return { kind: "unavailable", reason: timeline.reason, entries: [] };
  }
  return { kind: "timeline", entries: timeline.entries };
}

function l2norm(embedding: number[]): number {
  let sum = 0;
  for (const x of embedding) sum += x * x;
  return Math.round(Math.sqrt(sum) * 10_000) / 10_000;
}

function shapeNode(raw: Record<string, unknown>): { id: string; nodeType: string | null; propsPreview: string | null } {
  const id = String(raw.id ?? raw.node_id ?? "");
  const nodeType = typeof raw.node_type === "string" ? raw.node_type : null;
  const props = raw.properties;
  return {
    id,
    nodeType,
    propsPreview:
      props !== undefined && props !== null ? JSON.stringify(props).slice(0, 120) : null,
  };
}

function asRecords(data: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: Array<Record<string, unknown>> }).items;
  }
  return null;
}

function nameOf(t: unknown): string {
  if (typeof t === "string") return t;
  const r = t as Record<string, unknown>;
  return String(r.name ?? r.type ?? r.object_type ?? r.link_type ?? "?");
}

function countOf(t: unknown): number | null {
  if (typeof t === "object" && t !== null) {
    const c = (t as Record<string, unknown>).count;
    if (typeof c === "number") return c;
  }
  return null;
}
