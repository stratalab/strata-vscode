// @vitest-environment jsdom
/**
 * View logic headless (E8/N7): pure diff and layout, the JSON tree's
 * path breadcrumbs, and a full KV view render against a stubbed rpc.
 */
import { describe, expect, it } from "vitest";
import { structuralDiff, deepEqual } from "../../src/views/shared/jsonDiff";
import { hash01, runLayout, seedPosition } from "../../src/views/graph/force";
import { jsonTree } from "../../src/views/shared/jsonTree";
import { KvTableView } from "../../src/views/kvTable";
import type { ViewRpc } from "../../src/views/shared/rpc";
import type { ViewOp, ViewScope } from "../../src/views/shared/messages";

describe("structural diff (F4.2)", () => {
  it("marks added, removed, and changed paths", () => {
    const marks = structuralDiff(
      { name: "ada", tags: ["a", "b"], meta: { role: "eng" } },
      { name: "ada", tags: ["a", "c"], added: 1, meta: {} },
    );
    expect(marks.get("$.tags[1]")).toBe("changed");
    expect(marks.get("$.added")).toBe("added");
    expect(marks.get("$.meta.role")).toBe("removed");
    expect(marks.get("$.name")).toBeUndefined();
    expect(marks.get("$")).toBe("changed");
  });

  it("deepEqual is exact", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: "1" })).toBe(false);
  });
});

describe("force layout determinism (F4.5)", () => {
  it("produces identical layouts for identical inputs, within bounds", () => {
    const make = () => {
      const nodes = ["a", "b", "c", "d"].map((id) => ({ id, ...seedPosition(id, 800, 600) }));
      runLayout(nodes, [{ src: "a", dst: "b" }, { src: "b", dst: "c" }], 800, 600);
      return nodes;
    };
    const first = make();
    const second = make();
    expect(first).toEqual(second); // no randomness anywhere
    for (const node of first) {
      expect(node.x).toBeGreaterThanOrEqual(20);
      expect(node.x).toBeLessThanOrEqual(780);
      expect(node.y).toBeGreaterThanOrEqual(20);
      expect(node.y).toBeLessThanOrEqual(580);
    }
    expect(hash01("stable")).toBe(hash01("stable"));
    expect(hash01("a")).not.toBe(hash01("b"));
  });
});

describe("json tree (F4.2)", () => {
  it("renders breadcrumb paths and diff marks", () => {
    const copied: string[] = [];
    const marks = new Map([["$.b", "added" as const]]);
    const tree = jsonTree({ a: 1, b: { c: [true] } }, "$", (p) => copied.push(p), marks);
    document.body.append(tree);
    expect(tree.querySelectorAll(".json-leaf").length).toBeGreaterThan(0);
    expect(document.querySelector(".diff-added")).not.toBeNull();
    (document.querySelectorAll(".json-path")[0] as HTMLElement).click();
    expect(copied).toEqual(["$"]);
  });
});

describe("kv table view (F4.1)", () => {
  const SCOPE: ViewScope = { dbPath: "/db", branch: "default", space: "default", asOfMicros: null, asOfLabel: null };

  function stubRpc(handlers: Partial<Record<string, unknown>>): ViewRpc {
    return {
      scope: SCOPE,
      onScopeChange: () => {},
      request: (op: ViewOp) => Promise.resolve(handlers[op.op]),
    } as unknown as ViewRpc;
  }

  it("renders rows with the scope banner and page facts, sorts and filters", async () => {
    const root = document.createElement("div");
    const view = new KvTableView(
      root,
      stubRpc({
        "kv-page": {
          items: [
            { keyB64: "YQ==", label: "alpha", preview: "1", version: 2 },
            { keyB64: "Yg==", label: "beta", preview: "2", version: 1 },
          ],
          cursor: null,
          hasMore: true,
          total: 42,
        },
      }),
    );
    await view.reload();

    expect(root.querySelector(".scope-banner")!.textContent).toContain("branch default");
    expect(root.querySelector(".scope-banner")!.textContent).toContain("2 loaded of 42 — more available");
    expect(root.querySelector(".load-more")!.textContent).toContain("Load more");

    const cells = () => [...root.querySelectorAll(".cell-key")].map((el) => el.textContent);
    expect(cells()).toEqual(["alpha", "beta"]);

    // Sort by version ascending → beta first.
    ([...root.querySelectorAll("th")].find((el) => el.textContent!.startsWith("version")) as HTMLElement).click();
    expect(cells()).toEqual(["beta", "alpha"]);

    // Filter.
    const input = root.querySelector(".filter") as HTMLInputElement;
    input.value = "alp";
    input.dispatchEvent(new Event("input"));
    expect(cells()).toEqual(["alpha"]);
  });

  it("states the historical mode in the banner when scrubbed (F2.2/F4.6)", async () => {
    const root = document.createElement("div");
    const rpc = stubRpc({ "kv-page": { items: [], cursor: null, hasMore: false, total: 0 } });
    (rpc as { scope: ViewScope }).scope = { ...SCOPE, asOfMicros: 1, asOfLabel: "2026-08-05T00:00:00.000Z" };
    const view = new KvTableView(root, rpc);
    await view.reload();
    expect(root.querySelector(".banner-scrub")!.textContent).toContain("historical state; live refresh suspended");
    expect(root.querySelector(".banner-now")).not.toBeNull();
  });
});
