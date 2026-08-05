/**
 * The view data service against a real owner (M4/N7): every primitive's ops
 * exercised on seeded data — including chain verification, vector
 * summarization, and bounded graph expansion.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveStrataBin } from "../harness/strataBin";
import { StartedHost, TestDb } from "../harness/host";
import { InteractiveClient } from "../../src/wire/client";
import { ViewDataService } from "../../src/ui/viewData";
import type {
  ChainVerificationData,
  EventPageData,
  GraphExpandData,
  GraphNodeDetailData,
  JsonDocData,
  KvPageData,
  VectorCollectionsData,
  VectorPageData,
  ViewScope,
} from "../../src/views/shared/messages";

const bin = resolveStrataBin();
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch {
      // best-effort
    }
  }
});

const SCOPE: ViewScope = { dbPath: "", branch: "default", space: "default", asOfMicros: null, asOfLabel: null };

async function seededService() {
  const db = TestDb.create(bin!);
  cleanups.push(() => db.cleanup());
  db.seedKv([["greeting", "hello"], ["config", '{"mode":"live"}']]);
  db.cli(["json", "set", "doc1", "$", '{"name":"ada","tags":["a","b"]}']);
  db.cli(["event", "append", "agent.step", '{"thought":"begin"}']);
  db.cli(["event", "append", "agent.step", '{"thought":"continue"}']);
  db.cli(["event", "append", "agent.done", '{"result":42}']);
  db.cli(["vector", "collection", "create", "emb", "3"]);
  db.cli(["vector", "upsert", "emb", "v1", "[3,4,0]"]);
  db.cli(["graph", "create", "g"]);
  db.cli(["graph", "add-node", "g", "ada", "--properties", '{"role":"pioneer"}']);
  db.cli(["graph", "add-node", "g", "grace"]);
  db.cli(["graph", "add-edge", "g", "ada", "knows", "grace"]);

  const host = await StartedHost.start(db, bin!);
  cleanups.push(() => host.stop(bin!));
  const client = await InteractiveClient.connect(host.socketPath);
  cleanups.push(() => client.close());
  return { db, service: new ViewDataService(client) };
}

describe.skipIf(!bin)("view data service (real strata owner)", () => {
  it("serves every primitive's view ops on one seeded database", async () => {
    const { service } = await seededService();

    // KV (F4.1): decoded previews and forms.
    const kv = (await service.handle(SCOPE, { op: "kv-page" })) as KvPageData;
    expect(kv.items.map((i) => i.label).sort()).toEqual(["config", "greeting"]);
    expect(kv.total).toBe(2);

    // JSON (F4.2): document + tree content.
    const doc = (await service.handle(SCOPE, { op: "json-doc", docId: "doc1" })) as JsonDocData;
    expect(doc.found).toBe(true);
    expect(doc.value).toMatchObject({ name: "ada", tags: ["a", "b"] });

    // Events (F4.3): newest at the bottom, chain intact.
    const feed = (await service.handle(SCOPE, { op: "event-head" })) as EventPageData;
    expect(feed.items.map((i) => i.eventType)).toEqual(["agent.step", "agent.step", "agent.done"]);
    expect(feed.total).toBe(3);
    const chain = (await service.handle(SCOPE, { op: "verify-chain" })) as ChainVerificationData;
    expect(chain).toMatchObject({ valid: true, length: 3 });

    // Vectors (F4.4): summarized, never dumped.
    const collections = (await service.handle(SCOPE, { op: "vector-collections" })) as VectorCollectionsData;
    expect(collections.items[0]).toMatchObject({ name: "emb", dimension: 3, count: 1 });
    const vectors = (await service.handle(SCOPE, { op: "vector-page", collection: "emb" })) as VectorPageData;
    expect(vectors.items[0]).toMatchObject({ key: "v1", dimension: 3, norm: 5 });
    expect(JSON.stringify(vectors)).not.toContain("[3,4,0]");

    // Graph (F4.5): seed → expand → node detail.
    const seed = (await service.handle(SCOPE, { op: "graph-seed", graph: "g", count: 10 })) as GraphExpandData;
    expect(seed.nodes.length).toBeGreaterThanOrEqual(2);
    const expansion = (await service.handle(SCOPE, {
      op: "graph-neighbors",
      graph: "g",
      nodeId: "ada",
      limit: 25,
    })) as GraphExpandData;
    expect(expansion.edges).toContainEqual({ src: "ada", dst: "grace", edgeType: "knows" });
    const node = (await service.handle(SCOPE, { op: "graph-node", graph: "g", nodeId: "ada" })) as GraphNodeDetailData;
    expect(node.found).toBe(true);
    expect(JSON.stringify(node.properties)).toContain("pioneer");
  });

  it("live events append across processes; the scrubbed feed stays fixed (F4.3/F2.2)", async () => {
    const { db, service } = await seededService();
    const before = (await service.handle(SCOPE, { op: "event-head" })) as EventPageData;
    const lastSeq = before.items[before.items.length - 1]!.sequence;
    const scrubPoint = before.items[before.items.length - 1]!.timestamp;

    db.cli(["event", "append", "agent.step", '{"thought":"late"}']);

    const after = (await service.handle(SCOPE, { op: "event-head" })) as EventPageData;
    expect(after.items.length).toBe(before.items.length + 1);
    expect(after.items[after.items.length - 1]!.sequence).toBeGreaterThan(lastSeq);

    const scrubbed = (await service.handle(
      { ...SCOPE, asOfMicros: scrubPoint, asOfLabel: "then" },
      { op: "event-head" },
    )) as EventPageData;
    expect(scrubbed.items.length).toBe(before.items.length); // the late event is invisible in the past
  });
});
