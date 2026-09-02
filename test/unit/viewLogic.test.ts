// @vitest-environment jsdom
/**
 * View logic headless (E8/N7): pure diff and layout, the JSON tree's
 * path breadcrumbs, and a full KV view render against a stubbed rpc.
 */
import { describe, expect, it } from "vitest";
import { strataRail } from "../../src/views/shared/rail";
import { structuralDiff, deepEqual } from "../../src/views/shared/jsonDiff";
import { hash01, runLayout, seedPosition } from "../../src/views/graph/force";
import { jsonTree } from "../../src/views/shared/jsonTree";
import { SpaceBrowserView } from "../../src/views/spaceBrowser";
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

  function stubRpc(handlers: Partial<Record<string, unknown | ((op: ViewOp) => unknown)>>): ViewRpc {
    return {
      scope: SCOPE,
      onScopeChange: () => {},
      onFocus: () => {},
      request: (op: ViewOp) => {
        const handler = handlers[op.op];
        return Promise.resolve(typeof handler === "function" ? handler(op) : handler);
      },
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

    const crumbValues = [...root.querySelectorAll(".crumb-value")].map((el) => el.textContent);
    expect(crumbValues).toEqual(["default", "default"]); // branch, space
    expect(root.querySelector(".banner-crumbs")!.tagName).toBe("H1"); // the page's heading
    expect(root.querySelector(".scope-banner")!.textContent).toContain("2 loaded of 42 — next page available");
    expect(root.querySelector(".load-more")!.textContent).toContain("Load next page");

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

  it("jumps to a typed start key without walking intermediate pages", async () => {
    const root = document.createElement("div");
    const ops: ViewOp[] = [];
    const view = new KvTableView(
      root,
      stubRpc({
        "kv-page": (op: ViewOp) => {
          ops.push(op);
          return {
            items:
              op.op === "kv-page" && op.startText === "meta:"
                ? [{ keyB64: "bWV0YTplbnRpdGllcw==", label: "meta:entities", preview: "260", version: 1046 }]
                : [{ keyB64: "YQ==", label: "alpha", preview: "1", version: 1 }],
            cursor: null,
            hasMore: false,
            total: 1_000_000,
          };
        },
      }),
    );
    await view.reload();

    const jump = root.querySelector(".jump") as HTMLInputElement;
    jump.value = "meta:";
    jump.dispatchEvent(new Event("input"));
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await Promise.resolve();

    expect(ops).toContainEqual({ op: "kv-page", start: null, startText: "meta:" });
    expect(root.querySelector(".cell-key")!.textContent).toBe("meta:entities");
    expect(root.querySelector(".scope-banner")!.textContent).toContain('loaded from "meta:"');
  });

  it("focuses a key in the KV detail pane", async () => {
    const root = document.createElement("div");
    const ops: ViewOp[] = [];
    const view = new KvTableView(
      root,
      stubRpc({
        "kv-page": (op: ViewOp) => {
          ops.push(op);
          return {
            items: [{ keyB64: "bWV0YTplbnRpdGllcw==", label: "meta:entities", preview: "260", version: 1046 }],
            cursor: null,
            hasMore: false,
            total: 1,
          };
        },
        "kv-value": (op: ViewOp) => {
          ops.push(op);
          return { found: true, version: 1046, timestamp: 1046, text: null, json: 260, hex: "323630", byteLength: 3 };
        },
        "kv-history": (op: ViewOp) => {
          ops.push(op);
          return { kind: "unavailable", entries: [] };
        },
      }),
      { type: "kv-key", key: "bWV0YTplbnRpdGllcw==" },
    );

    await view.reload();

    expect(ops).toContainEqual({ op: "kv-page", start: "bWV0YTplbnRpdGllcw==" });
    expect(ops).toContainEqual({ op: "kv-value", key: "bWV0YTplbnRpdGllcw==" });
    expect(root.querySelector(".detail-key")!.textContent).toBe("meta:entities");
    expect(root.querySelector(".json-number")!.textContent).toBe("260");
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

describe("space browser view", () => {
  const SCOPE: ViewScope = { dbPath: "/db", branch: "default", space: "default", asOfMicros: null, asOfLabel: null };

  function stubRpc(handlers: Partial<Record<string, unknown | ((op: ViewOp) => unknown)>>): ViewRpc {
    return {
      scope: SCOPE,
      onScopeChange: () => {},
      onFocus: () => {},
      request: (op: ViewOp) => {
        const handler = handlers[op.op];
        return Promise.resolve(typeof handler === "function" ? handler(op) : handler);
      },
    } as unknown as ViewRpc;
  }

  it("renders one mixed data list and field/value detail for object KV values", async () => {
    const root = document.createElement("div");
    const ops: ViewOp[] = [];
    const view = new SpaceBrowserView(
      root,
      stubRpc({
        "space-page": () => ({
          items: [
            {
              id: "kv:a",
              kind: "kv",
              label: "user:ada",
              preview: '{"name":"Ada","role":"admin"}',
              meta: "Key-Value",
              version: 3,
              timestamp: null,
              keyB64: "dXNlcjphZGE=",
            },
            {
              id: "json:doc1",
              kind: "json",
              label: "doc1",
              preview: "Document",
              meta: "Document",
              version: null,
              timestamp: null,
              docId: "doc1",
            },
          ],
          cursor: null,
          hasMore: false,
          total: 2,
          notes: [],
        }),
        "kv-value": (op: ViewOp) => {
          ops.push(op);
          return { found: true, version: 3, timestamp: 9, text: null, json: { name: "Ada", role: "admin" }, hex: "", byteLength: 29 };
        },
        "kv-history": (op: ViewOp) => {
          ops.push(op);
          return { kind: "unavailable", entries: [] };
        },
      }),
    );

    await view.reload();

    const toolbar = root.querySelector(".toolbar")!;
    expect(toolbar.children[0]).toBe(root.querySelector(".space-filters"));
    expect(toolbar.children[1]).toBe(root.querySelector(".key-find"));
    expect(toolbar.children[2]).toBe(root.querySelector(".sort-control"));
    expect(toolbar.children[3]).toBe(root.querySelector(".write-slot"));
    expect(root.querySelector(".new-object-button")!.getAttribute("disabled")).toBe("true");
    expect([...root.querySelectorAll(".type-pill")].map((el) => el.textContent)).toContain("Key");
    expect([...root.querySelectorAll(".cell-key")].map((el) => el.textContent)).toEqual(["user:ada", "doc1"]);

    (root.querySelector("tbody tr") as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(ops).toContainEqual({ op: "kv-value", key: "dXNlcjphZGE=" });
    expect(root.querySelector(".field-table")!.textContent).toContain("nameAda");
    expect(root.querySelector(".field-table")!.textContent).toContain("roleadmin");
  });

  it("filters loaded keys live and restores broader matches when text is removed", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ops: ViewOp[] = [];
    const view = new SpaceBrowserView(
      root,
      stubRpc({
        "space-page": (op: ViewOp) => {
          ops.push(op);
          return {
            items: [
              {
                id: "kv:india",
                kind: "kv",
                label: "India",
                preview: "IN",
                meta: "Key-Value",
                version: 7,
                timestamp: null,
                keyB64: "SW5kaWE=",
              },
              {
                id: "kv:indonesia",
                kind: "kv",
                label: "Indonesia",
                preview: "ID",
                meta: "Key-Value",
                version: 5,
                timestamp: null,
                keyB64: "SW5kb25lc2lh",
              },
              {
                id: "kv:canada",
                kind: "kv",
                label: "Canada",
                preview: "CA",
                meta: "Key-Value",
                version: 2,
                timestamp: null,
                keyB64: "Q2FuYWRh",
              },
            ],
            cursor: null,
            hasMore: false,
            total: 3,
            notes: [],
          };
        },
      }),
    );

    await view.reload();

    const keys = () => [...root.querySelectorAll(".cell-key")].map((el) => el.textContent);
    let input = root.querySelector(".key-filter") as HTMLInputElement;
    input.focus();

    input.value = "IN";
    input.dispatchEvent(new Event("input"));
    expect(keys()).toEqual(["India", "Indonesia"]);
    expect(document.activeElement).toBe(root.querySelector(".key-filter"));

    input = root.querySelector(".key-filter") as HTMLInputElement;
    input.value = "INDI";
    input.dispatchEvent(new Event("input"));
    expect(keys()).toEqual(["India"]);

    input = root.querySelector(".key-filter") as HTMLInputElement;
    input.value = "IND";
    input.dispatchEvent(new Event("input"));
    expect(keys()).toEqual(["India", "Indonesia"]);

    expect(ops).toEqual([{ op: "space-page", filter: "all", cursor: null }]);
    root.remove();
  });

  it("sorts objects and supports keyboard search and row selection", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const ops: ViewOp[] = [];
    const view = new SpaceBrowserView(
      root,
      stubRpc({
        "space-page": (op: ViewOp) => {
          ops.push(op);
          return {
            items: [
              {
                id: "kv:india",
                kind: "kv",
                label: "India",
                preview: "IN",
                meta: "Key-Value",
                version: 7,
                timestamp: null,
                keyB64: "SW5kaWE=",
              },
              {
                id: "kv:indonesia",
                kind: "kv",
                label: "Indonesia",
                preview: "ID",
                meta: "Key-Value",
                version: 5,
                timestamp: null,
                keyB64: "SW5kb25lc2lh",
              },
              {
                id: "kv:canada",
                kind: "kv",
                label: "Canada",
                preview: "CA",
                meta: "Key-Value",
                version: 2,
                timestamp: null,
                keyB64: "Q2FuYWRh",
              },
            ],
            cursor: null,
            hasMore: false,
            total: 3,
            notes: [],
          };
        },
        "kv-value": (op: ViewOp) => {
          ops.push(op);
          return { found: true, version: 2, timestamp: 10, text: "CA", json: null, hex: "4341", byteLength: 2 };
        },
        "kv-history": (op: ViewOp) => {
          ops.push(op);
          return { kind: "unavailable", entries: [] };
        },
      }),
    );

    await view.reload();

    const keys = () => [...root.querySelectorAll(".cell-key")].map((el) => el.textContent);
    const sort = root.querySelector(".sort-select") as HTMLSelectElement;
    sort.value = "version";
    sort.dispatchEvent(new Event("change"));
    expect(keys()).toEqual(["Canada", "Indonesia", "India"]);

    (root.querySelector(".sort-direction") as HTMLButtonElement).click();
    expect(keys()).toEqual(["India", "Indonesia", "Canada"]);

    const shell = root.querySelector(".object-browser-shell") as HTMLElement;
    shell.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    expect(document.activeElement).toBe(root.querySelector(".key-filter"));

    let input = root.querySelector(".key-filter") as HTMLInputElement;
    input.value = "can";
    input.dispatchEvent(new Event("input"));
    expect(keys()).toEqual(["Canada"]);

    input = root.querySelector(".key-filter") as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(keys()).toEqual(["India", "Indonesia", "Canada"]);

    shell.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(root.querySelector("tbody tr")!.className).toContain("selected");
    expect(root.querySelector(".detail-key")!.textContent).toBe("India");
    expect(ops).toContainEqual({ op: "kv-value", key: "SW5kaWE=" });
    root.remove();
  });
});

describe("strata rail (SIG-1)", () => {
  const entries = [
    { version: 3, timestamp: 3_000_000, tombstone: false, preview: "newest" },
    { version: 2, timestamp: 2_000_000, tombstone: true, preview: null },
    { version: 1, timestamp: 1_000_000, tombstone: false, preview: "oldest" },
  ];

  it("renders newest-on-top with depth, tombstone, and the active marker", () => {
    const picked: number[] = [];
    const rail = strataRail(entries, {
      title: "History",
      verb: "Scrub here",
      activeMicros: 2_000_000,
      onPick: (e) => picked.push(e.version),
    });
    const rows = [...rail.querySelectorAll(".rail-entry")];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute("data-newest")).toBe("true");
    expect(rows[1]!.className).toContain("tombstone");
    expect(rows[1]!.className).toContain("active");
    expect(rows[1]!.getAttribute("aria-selected")).toBe("true");
    expect(rows[1]!.textContent).toContain("current position");
    expect(rows[2]!.textContent).toContain("Scrub here");
    (rows[0] as HTMLButtonElement).click();
    expect(picked).toEqual([3]);
  });

  it("is an arrow-key navigable listbox", () => {
    const rail = strataRail(entries, { title: "History", verb: "Scrub here", activeMicros: null, onPick: () => {} });
    document.body.append(rail);
    const rows = [...rail.querySelectorAll<HTMLButtonElement>(".rail-entry")];
    rows[0]!.focus();
    rail.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    rail.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(rows[0]);
    rail.remove();
  });
});
