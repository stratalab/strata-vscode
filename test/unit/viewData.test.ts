/**
 * The view data service (E8) against the fake owner: shaping, scrub
 * switching, float summarization, bounded expansion, and the F3.4 gate.
 */
import { afterEach, describe, expect, it } from "vitest";
import { FakeServer } from "../harness/fakeServer";
import { InteractiveClient } from "../../src/wire/client";
import { ViewDataService, GRAPH_FANOUT_LIMIT } from "../../src/ui/viewData";
import { shapeViewError } from "../../src/ui/viewData";
import { CommandFailedError } from "../../src/wire/errors";
import { encodeUtf8 } from "../../src/wire/bytes";
import type { ViewScope } from "../../src/views/shared/messages";

let server: FakeServer | null = null;
let client: InteractiveClient | null = null;
afterEach(async () => {
  client?.close();
  client = null;
  await server?.close();
  server = null;
});

const LIVE: ViewScope = { dbPath: "/db", branch: "default", space: "default", asOfMicros: null, asOfLabel: null };
const SCRUBBED: ViewScope = { ...LIVE, asOfMicros: 555, asOfLabel: "then" };

const page = (items: unknown[], cursor: unknown = null, hasMore = false) => ({ cursor, has_more: hasMore, items });

async function build(
  handlers: Record<string, (cmd: Record<string, unknown>) => unknown>,
  confirm: (label: string) => Promise<boolean> = async () => true,
) {
  const requests: Array<Record<string, unknown>> = [];
  server = await FakeServer.start({
    onRequest: (envelope) => {
      requests.push(envelope.command);
      const handler = handlers[String(envelope.command.type)];
      return handler ? handler(envelope.command) : { error: { class: "not_found", code: "not_found.test.unrouted", message: String(envelope.command.type) } };
    },
  });
  client = await InteractiveClient.connect(server.socketPath);
  return { service: new ViewDataService(client, confirm), requests };
}

describe("kv ops", () => {
  it("shapes live pages from kv.scan and scrubbed pages from kv.list+as_of", async () => {
    const { service, requests } = await build({
      kv_scan: () => ({ type: "kv_scan_result", data: page([{ key: encodeUtf8("a"), value: encodeUtf8("hello"), version: 3, timestamp: 1 }]) }),
      kv_list: () => ({ type: "keys_page", data: page([encodeUtf8("a")]) }),
      kv_count: () => ({ type: "uint", data: 1 }),
    });
    const live = (await service.handle(LIVE, { op: "kv-page" })) as { items: Array<{ label: string; preview: string }> };
    expect(live.items[0]).toMatchObject({ label: "a", preview: "hello", version: 3 });

    const past = (await service.handle(SCRUBBED, { op: "kv-page" })) as { items: Array<{ version: null }> };
    expect(past.items[0]!.version).toBeNull();
    expect(requests.find((r) => r.type === "kv_list")!.as_of).toBe(555);
    expect(requests.filter((r) => r.type === "kv_scan")).toHaveLength(1); // live only
  });

  it("ships all three value forms with byte facts", async () => {
    const { service } = await build({
      kv_get: () => ({
        type: "kv_versioned_value",
        data: { found: true, value: { value: encodeUtf8('{"a":1}'), version: 2, timestamp: 9 } },
      }),
    });
    const value = (await service.handle(LIVE, { op: "kv-value", key: encodeUtf8("k") })) as Record<string, unknown>;
    expect(value).toMatchObject({ found: true, version: 2, json: { a: 1 }, text: null, byteLength: 7 });
    expect(value.hex).toBe(Buffer.from('{"a":1}').toString("hex"));
  });
});

describe("event ops (F4.3)", () => {
  it("pages backward from the head via reverse range, delivered ascending", async () => {
    const events = (seqs: number[]) =>
      seqs.map((sequence) => ({
        event: { sequence, event_type: "step", payload: { sequence }, hash: `h${sequence}`, previous_hash: `h${sequence - 1}`, timestamp: sequence },
        version: sequence,
        timestamp: sequence * 1_000_000,
      }));
    const { service, requests } = await build({
      event_count: () => ({ type: "event_count", data: { count: 250 } }),
      // Sequences are 0-based; the head is count - 1 = 249, and a reverse
      // range starts at an existing sequence (probed against the real owner).
      event_range: (cmd) => ({
        type: "event_records",
        data: page(events(cmd.start_seq === 249 ? [249, 248, 247] : [246, 245]), null, true),
      }),
    });
    const head = (await service.handle(LIVE, { op: "event-head" })) as { items: Array<{ sequence: number }>; earlier: number | null; total: number };
    expect(head.items.map((i) => i.sequence)).toEqual([247, 248, 249]); // ascending, newest last
    expect(head.earlier).toBe(246); // strictly before the oldest loaded row
    expect(head.total).toBe(250);
    expect(requests.find((r) => r.type === "event_range")!.start_seq).toBe(249);
    expect(requests.find((r) => r.type === "event_range")!.direction).toBe("reverse");

    const earlier = (await service.handle(LIVE, { op: "event-head", beforeSeq: 246 })) as { items: Array<{ sequence: number }>; earlier: number | null };
    expect(earlier.items.map((i) => i.sequence)).toEqual([245, 246]);
    expect(earlier.earlier).toBe(244);
  });
});

describe("vector ops (F4.4)", () => {
  it("summarizes float payloads — dimensions and norm, never the embedding", async () => {
    const { service } = await build({
      vector_scan: () => ({
        type: "vector_scan_result",
        data: page([
          { key: "v1", version: 1, timestamp: 1, vector_revision: 1, data: { embedding: [3, 4], metadata: { tag: "x" } } },
        ]),
      }),
    });
    const result = (await service.handle(LIVE, { op: "vector-page", collection: "emb" })) as { items: Array<Record<string, unknown>> };
    expect(result.items[0]).toMatchObject({ key: "v1", dimension: 2, norm: 5, metadataPreview: '{"tag":"x"}' });
    expect(JSON.stringify(result)).not.toContain("embedding"); // floats never cross raw
  });
});

describe("graph ops (F4.5)", () => {
  it("bounds neighbor expansion and reports truncation — no silent caps", async () => {
    const { service, requests } = await build({
      graph_neighbors: (cmd) => ({
        type: "graph_neighbor_page",
        data: page(
          Array.from({ length: Number(cmd.limit) }, (_, i) => ({
            direction: "outgoing", graph: "g", node_id: `n${i}`, src: "seed", dst: `n${i}`,
            edge_type: "linked", edge: {}, node: { node_type: "person", properties: { i } },
          })),
          "more",
          true,
        ),
      }),
    });
    const result = (await service.handle(LIVE, { op: "graph-neighbors", graph: "g", nodeId: "seed", limit: 9999 })) as {
      nodes: unknown[]; truncated: boolean;
    };
    // The request was clamped to the fan-out bound regardless of what the view asked.
    expect(requests[0]!.limit).toBe(GRAPH_FANOUT_LIMIT);
    expect(result.truncated).toBe(true);
    expect(result.nodes).toHaveLength(GRAPH_FANOUT_LIMIT);
  });

  it("gates analytics behind the expensive confirmation (F3.4 reuse)", async () => {
    let asked = "";
    const { service, requests } = await build(
      { graph_pagerank: () => ({ type: "graph_pagerank_result", data: { graph: "g", iterations: 5, personalized: false, ranks: { a: 0.7 } } }) },
      async (label) => {
        asked = label;
        return false; // user declines
      },
    );
    const declined = (await service.handle(LIVE, { op: "graph-analytics", graph: "g", algorithm: "pagerank" })) as { cancelled?: boolean };
    expect(declined.cancelled).toBe(true);
    expect(asked).toContain("pagerank");
    expect(requests).toHaveLength(0); // nothing ran without consent
  });

  it("maps wcc string components to stable numeric indices", async () => {
    const { service } = await build({
      graph_wcc: () => ({ type: "graph_wcc_result", data: { components: { a: "c-9", b: "c-9", c: "c-2" } } }),
    });
    const result = (await service.handle(LIVE, { op: "graph-analytics", graph: "g", algorithm: "wcc" })) as { scores: Record<string, number> };
    expect(result.scores.a).toBe(result.scores.b);
    expect(result.scores.a).not.toBe(result.scores.c);
  });
});

describe("error shaping (F2.5)", () => {
  it("marks retention errors as states", () => {
    const shaped = shapeViewError(
      new CommandFailedError({ class: "history_unavailable", code: "history_unavailable.engine.persistence_history", message: "gone" }),
    );
    expect(shaped.retention).toBe(true);
    const other = shapeViewError(new CommandFailedError({ class: "not_found", code: "x", message: "y" }));
    expect(other.retention).toBe(false);
  });
});
