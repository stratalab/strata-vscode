/**
 * Time travel and console against a real owner (N7 + E6/E7): seeded
 * multi-version history, exact as_of reads, scrubbed key listing, branch
 * fork + divergence + comparison, and the console runner end-to-end.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveStrataBin } from "../harness/strataBin";
import { StartedHost, TestDb } from "../harness/host";
import { InteractiveClient } from "../../src/wire/client";
import { kvTimeline } from "../../src/explorer/history";
import { compareKvAcrossBranches } from "../../src/explorer/compare";
import { executeRun, planRun, renderResult } from "../../src/console/runner";
import { encodeUtf8 } from "../../src/wire/bytes";

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

async function seededHost() {
  const db = TestDb.create(bin!);
  cleanups.push(() => db.cleanup());
  return db;
}

const SCOPE = { dbPath: "", branch: "default", space: "default" };

describe.skipIf(!bin)("time travel (real strata owner)", () => {
  it("reads exact historical values via the timeline and as_of (F2.2, F2.3)", async () => {
    const db = await seededHost();
    db.seedKv([["story", "draft-1"]]);
    await new Promise((r) => setTimeout(r, 30));
    db.seedKv([["story", "draft-2"]]);
    await new Promise((r) => setTimeout(r, 30));
    db.seedKv([["story", "final"]]);

    const host = await StartedHost.start(db, bin!);
    cleanups.push(() => host.stop(bin!));
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());

    const timeline = await kvTimeline(client, { ...SCOPE, dbPath: db.dbPath }, encodeUtf8("story"));
    expect(timeline.kind).toBe("timeline");
    if (timeline.kind !== "timeline") return;
    expect(timeline.entries.length).toBeGreaterThanOrEqual(3);
    const drafts = [...timeline.entries].sort((a, b) => a.version - b.version);

    // The scrub payoff (F2.2): reading at the middle version's timestamp
    // returns exactly the middle value.
    const middle = drafts[1]!;
    const got = await client.request(
      "kv.get",
      { key: encodeUtf8("story"), as_of: middle.timestamp },
      { branch: "default", space: "default" },
    );
    expect(got.data.found).toBe(true);
    expect(got.data.value?.value).toBe(encodeUtf8("draft-2"));
    expect(got.data.value?.version).toBe(middle.version);
  });

  it("lists only the keys that existed at the scrub position (kv.list as_of)", async () => {
    const db = await seededHost();
    db.seedKv([["early", "1"]]);
    const host = await StartedHost.start(db, bin!);
    cleanups.push(() => host.stop(bin!));
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());

    // Capture "then", then write another key after it.
    const timeline = await kvTimeline(client, { ...SCOPE, dbPath: db.dbPath }, encodeUtf8("early"));
    if (timeline.kind !== "timeline") throw new Error("expected a timeline");
    const then = timeline.entries[0]!.timestamp;
    await new Promise((r) => setTimeout(r, 30));
    db.seedKv([["late", "2"]]);

    const now = await client.request(
      "kv.list",
      { limit: 100, space: "default" },
      { branch: "default", space: "default" },
    );
    expect(now.data.items).toHaveLength(2);

    const past = await client.request(
      "kv.list",
      { limit: 100, space: "default", as_of: then },
      { branch: "default", space: "default" },
    );
    expect(past.data.items).toHaveLength(1);
    expect(past.data.items[0]).toBe(encodeUtf8("early"));
  });

  it("compares a key across a forked branch after divergence (F2.4)", async () => {
    const db = await seededHost();
    db.seedKv([["setting", "shared"]]);
    db.cli(["branch", "fork", "default", "experiment"]);
    db.cli(["--branch", "experiment", "kv", "put", "setting", "diverged"]);

    const host = await StartedHost.start(db, bin!);
    cleanups.push(() => host.stop(bin!));
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());

    const comparison = await compareKvAcrossBranches(
      client,
      { ...SCOPE, dbPath: db.dbPath },
      encodeUtf8("setting"),
      "experiment",
    );
    const left = JSON.parse(comparison.left.content) as { value: { display: string } };
    const right = JSON.parse(comparison.right.content) as { value: { display: string } };
    expect(left.value.display).toBe("shared");
    expect(right.value.display).toBe("diverged");
    expect(comparison.left.branch).toBe("default");
    expect(comparison.right.branch).toBe("experiment");
  });

  it("runs console reads end-to-end, honoring the scrub context (E7)", async () => {
    const db = await seededHost();
    db.seedKv([["k", "old"]]);
    const host = await StartedHost.start(db, bin!);
    cleanups.push(() => host.stop(bin!));
    const client = await InteractiveClient.connect(host.socketPath);
    cleanups.push(() => client.close());

    const timeline = await kvTimeline(client, { ...SCOPE, dbPath: db.dbPath }, encodeUtf8("k"));
    if (timeline.kind !== "timeline") throw new Error("expected a timeline");
    const then = timeline.entries[0]!.timestamp;
    await new Promise((r) => setTimeout(r, 30));
    db.seedKv([["k", "new"]]);

    // Live console read sees "new"; scrubbed console read sees "old".
    const live = planRun("kv.get", { key: encodeUtf8("k") }, { branch: "default" });
    const liveResult = await executeRun(client, live, { branch: "default" });
    expect(JSON.stringify(liveResult)).toContain(encodeUtf8("new"));

    const scrubbed = planRun("kv.get", { key: encodeUtf8("k") }, { branch: "default", asOfMicros: then });
    expect(scrubbed.wireCommand.as_of).toBe(then);
    const pastResult = await executeRun(client, scrubbed, { branch: "default", asOfMicros: then });
    expect(JSON.stringify(pastResult)).toContain(encodeUtf8("old"));

    const rendered = JSON.parse(renderResult(scrubbed, { branch: "default", asOfMicros: then }, pastResult));
    expect(rendered.as_of).toBe(then);
  });
});
