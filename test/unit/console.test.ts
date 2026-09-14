/**
 * Console engine (F3): palette composition, pre-send validation, run
 * planning with scrub injection and expensive gating, cursor continuation,
 * error envelope rendering, and replayable history.
 */
import { describe, expect, it } from "vitest";
import { buildPalette } from "../../src/console/palette";
import { validatePayload, validateRawCommand } from "../../src/console/validate";
import {
  commandTakesAsOf,
  continuationPayload,
  planRun,
  renderError,
  renderErrorReport,
  renderResultReport,
} from "../../src/console/runner";
import { ConsoleHistoryStore, type ConsoleHistoryEntry } from "../../src/console/historyStore";
import { CommandFailedError } from "../../src/wire/errors";
import { COMMAND_FORMS, COMMAND_IDS, COMMANDS } from "../../src/generated";

describe("palette (F3.1, AR-4.2, §2)", () => {
  it("lists every non-inference command: reads runnable, writes greyed", () => {
    const palette = buildPalette();
    expect(palette).toHaveLength(125);
    expect(palette.filter((p) => p.runnable)).toHaveLength(78);
    expect(palette.filter((p) => !p.runnable)).toHaveLength(47);
    expect(palette.some((p) => p.family === "inference")).toBe(false);
    expect(palette.filter((p) => p.family === "hub" && p.runnable)).toHaveLength(5);
    // Grouped by family, stable order.
    const families = palette.map((p) => p.family);
    expect([...families].sort()).toEqual(families);
    // Wire-only commands are marked (AR-1.6).
    expect(palette.some((p) => p.wireOnly)).toBe(true);
  });
});

describe("validation (F3.2, AR-6.2)", () => {
  it("rejects unknown fields — requests are deny_unknown_fields upstream", () => {
    const errors = validatePayload("kv.get", { key: "aGk=", surprise: 1 });
    expect(errors.join()).toContain('unknown field "surprise"');
  });

  it("requires required fields and checks kinds", () => {
    expect(validatePayload("kv.get", {}).join()).toContain("missing required");
    expect(validatePayload("kv.get", { key: "not base64!" }).join()).toContain("base64");
    expect(validatePayload("kv.get", { key: "aGk=" })).toEqual([]);
  });

  it("resolves raw wire commands by type tag and validates them", () => {
    const good = validateRawCommand({ type: "kv_get", key: "aGk=" });
    expect(good.commandId).toBe("kv.get");
    expect(good.errors).toEqual([]);
    expect(validateRawCommand({ key: "aGk=" }).errors.join()).toContain('missing "type"');
    expect(validateRawCommand({ type: "kv_get_v9" }).errors.join()).toContain("unknown wire type");
  });
});

describe("run planning (F2.2, F3.4)", () => {
  it("injects the scrub position only into as_of-taking commands", () => {
    const scrubbed = { branch: "default", asOfMicros: 12345 };
    expect(commandTakesAsOf("kv.get")).toBe(true);
    expect(planRun("kv.get", { key: "aGk=" }, scrubbed).wireCommand.as_of).toBe(12345);
    // branch.list takes no as_of — the scrub must not leak into it.
    expect(commandTakesAsOf("branch.list")).toBe(false);
    expect(planRun("branch.list", {}, scrubbed).wireCommand.as_of).toBeUndefined();
    // An explicit as_of in the payload wins over the scrub.
    expect(planRun("kv.get", { key: "aGk=", as_of: 7 }, scrubbed).wireCommand.as_of).toBe(7);
  });

  it("flags expensive kinds for the F3.4 confirmation with a longer deadline", () => {
    const pagerank = planRun("graph.analytics.pagerank", { graph: "g" }, { branch: "default" });
    expect(pagerank.needsConfirmation).toBe(true);
    expect(pagerank.deadlineMs).toBe(60_000);
    const get = planRun("kv.get", { key: "aGk=" }, { branch: "default" });
    expect(get.needsConfirmation).toBe(false);
    expect(get.deadlineMs).toBe(2_000);
  });

  it("as_of coverage matches the generated schema facts, not a hand list", () => {
    const fromSpecs = COMMAND_IDS.filter((id) => COMMAND_FORMS[id].takesAsOf);
    expect(fromSpecs.length).toBeGreaterThan(20);
    for (const id of fromSpecs) expect(commandTakesAsOf(id)).toBe(true);
  });
});

describe("cursor continuation (F3.3)", () => {
  const pageResponse = (cursor: unknown) => ({
    type: "x",
    data: { cursor, has_more: true, items: [] },
  });

  it("maps each family's resume field", () => {
    expect(continuationPayload("kv.scan", { limit: 5 }, pageResponse("bmV4dA=="))).toEqual({
      limit: 5,
      start: "bmV4dA==",
    });
    expect(continuationPayload("json.list", {}, pageResponse("c2"))).toEqual({ cursor: "c2" });
    expect(continuationPayload("event.list", {}, pageResponse(42))).toEqual({ after_sequence: 42 });
  });

  it("returns null when the page is done or the shape is not a page", () => {
    expect(
      continuationPayload("kv.scan", {}, { type: "x", data: { cursor: null, has_more: false, items: [] } }),
    ).toBeNull();
    expect(continuationPayload("kv.get", {}, { type: "kv_versioned_value", data: {} })).toBeNull();
  });
});

describe("error rendering (F3.5)", () => {
  it("renders the full envelope with the registry docs link", () => {
    const run = planRun("kv.get", { key: "aGk=" }, { branch: "default" });
    const rendered = JSON.parse(
      renderError(
        run,
        new CommandFailedError({
          class: "unavailable",
          code: "unavailable.executor.ipc_deadline",
          message: "shed",
          retry_policy: "same_request",
          commit_outcome: "not_started",
        }),
      ),
    );
    expect(rendered.error).toMatchObject({
      class: "unavailable",
      code: "unavailable.executor.ipc_deadline",
      retry_policy: "same_request",
      commit_outcome: "not_started",
      docs: "https://stratadb.org/e/unavailable.executor.ipc_deadline",
    });
  });
});

describe("result report rendering (1.2.2 output UX)", () => {
  it("renders paged results as a summary with raw JSON secondary", () => {
    const run = planRun("kv.scan", { limit: 2 }, { branch: "default" });
    const report = renderResultReport(run, { branch: "default" }, {
      type: "kv_scan_result",
      data: {
        has_more: true,
        cursor: "bmV4dA==",
        items: [
          { key: "aW5kaWE=", version: 7, timestamp: 7 },
          { key: "aW5kb25lc2lh", version: 8, timestamp: 8 },
        ],
      },
    });

    expect(report).toContain("# kv.scan result");
    expect(report).toContain("## Page");
    expect(report).toContain("| Loaded | 2 items |");
    expect(report).toContain("Key: aW5kaWE=");
    expect(report).toContain("## Raw JSON");
  });

  it("renders write receipts before the raw envelope", () => {
    const run = planRun("kv.put", { key: "aGk=", value: "dGhlcmU=" }, { branch: "default" });
    const report = renderResultReport(run, { branch: "default" }, {
      type: "kv_put_result",
      data: {
        effect: { kind: "created" },
        commit: {
          version: 12,
          timestamp: 12,
          committed_at: 1_800_000_000_000_000,
          put_count: 1,
          delete_count: 0,
          durability: "standard",
        },
      },
    });

    expect(report).toContain("## Write Receipt");
    expect(report).toContain("| Effect | created |");
    expect(report).toContain("| Version | 12 |");
    expect(report.indexOf("## Write Receipt")).toBeLessThan(report.indexOf("## Raw JSON"));
  });

  it("renders branch diffs as a comparison table", () => {
    const run = planRun("branch.diff", { branch_a: "main", branch_b: "experiment" }, { branch: "main" });
    const report = renderResultReport(run, { branch: "main" }, {
      type: "branch_comparison",
      data: {
        branch_a: "main",
        branch_b: "experiment",
        spaces: [
          { space: "default", capability: "kv", added: 1, modified: 2, removed: 0 },
        ],
      },
    });

    expect(report).toContain("## Branch Diff");
    expect(report).toContain("| From | main |");
    expect(report).toContain("| default | kv | 1 | 2 | 0 |");
  });

  it("renders structured errors with docs and raw JSON", () => {
    const run = planRun("kv.get", { key: "aGk=" }, { branch: "default" });
    const report = renderErrorReport(
      run,
      new CommandFailedError({
        class: "unavailable",
        code: "unavailable.executor.ipc_deadline",
        message: "shed",
        retry_policy: "same_request",
        commit_outcome: "not_started",
      }),
    );

    expect(report).toContain("# kv.get error");
    expect(report).toContain("| Code | unavailable.executor.ipc_deadline |");
    expect(report).toContain("https://stratadb.org/e/unavailable.executor.ipc_deadline");
    expect(report).toContain("## Raw JSON");
  });
});

describe("console history (F3.6)", () => {
  it("records newest-first, caps at 100, and survives its persistence", () => {
    let saved: ConsoleHistoryEntry[] = [];
    const store = new ConsoleHistoryStore({
      loadConsoleHistory: () => saved,
      saveConsoleHistory: (entries) => (saved = entries),
    });
    for (let i = 0; i < 105; i++) {
      store.record({ commandId: "kv.get", payload: { key: "aGk=", n: i }, branch: "default", at: `t${i}` });
    }
    expect(store.list()).toHaveLength(100);
    expect(store.list()[0]!.payload.n).toBe(104);

    const reloaded = new ConsoleHistoryStore({
      loadConsoleHistory: () => saved,
      saveConsoleHistory: () => {},
    });
    expect(reloaded.list()).toHaveLength(100);
  });
});

describe("form specs cover the runnable catalog", () => {
  it("every non-inference read command has a generated form spec", () => {
    for (const id of COMMAND_IDS) {
      if (COMMANDS[id].family === "inference" || COMMANDS[id].access !== "read") continue;
      expect(COMMAND_FORMS[id], id).toBeDefined();
      for (const field of COMMAND_FORMS[id].fields) {
        expect(["string", "number", "boolean", "bytes", "enum", "json"]).toContain(field.kind);
        expect(["type", "branch", "space", "as_of"]).not.toContain(field.name);
      }
    }
  });
});
