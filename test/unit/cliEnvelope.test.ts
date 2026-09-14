import { describe, expect, it } from "vitest";
import { cliErrorFromEnvelope, firstCliJsonObject } from "../../src/cli/envelope";

describe("CLI envelope parsing", () => {
  it("extracts the first JSON object from mixed CLI streams", () => {
    expect(firstCliJsonObject("warning\n{\"hub.url\":\"https://hub.example\",\"source\":\"config\"}\n")).toEqual({
      "hub.url": "https://hub.example",
      source: "config",
    });
  });

  it("skips JSONL progress envelopes when looking for the final result", () => {
    const parsed = firstCliJsonObject(
      '{"type":"hub_clone_progress","data":{"stage":"resolved"}}\n{"type":"hub_clone_result","data":{"dataset":"demo"}}\n',
      "",
      { skip: (value) => value.type === "hub_clone_progress" },
    );

    expect(parsed).toEqual({ type: "hub_clone_result", data: { dataset: "demo" } });
  });

  it("maps structured error envelopes without reading human text", () => {
    const error = cliErrorFromEnvelope({
      error: {
        class: "unavailable",
        code: "unavailable.executor.hub_transport",
        message: "hub offline",
        docs_url: "https://stratadb.org/e/unavailable.executor.hub_transport",
        hints: ["try again"],
        retryable: true,
      },
    });

    expect(error).toEqual({
      class: "unavailable",
      code: "unavailable.executor.hub_transport",
      message: "hub offline",
      suggestedFix: "try again",
      docsUrl: "https://stratadb.org/e/unavailable.executor.hub_transport",
      retryable: true,
    });
  });
});
