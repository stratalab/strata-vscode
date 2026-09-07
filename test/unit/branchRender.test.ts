import { describe, expect, it } from "vitest";
import { renderBranchDiffDocument, summarizeBranchDiff } from "../../src/branch/render";
import type { BranchComparisonItem } from "../../src/generated";
import { encodeUtf8 } from "../../src/wire/bytes";

const DIFF: BranchComparisonItem = {
  branch_a: "default",
  branch_b: "experiment",
  spaces: [
    {
      space: "default",
      capability: "key_value",
      added: [{ identity: encodeUtf8("agent:new"), version: 7 }],
      removed: [],
      modified: [{ identity: encodeUtf8("agent:memory"), version: 9 }],
    },
    {
      space: "default",
      capability: "json",
      added: [],
      removed: [{ identity: encodeUtf8("plan"), version: 4 }],
      modified: [],
    },
  ],
};

describe("branch diff rendering", () => {
  it("summarizes directional branch differences", () => {
    expect(summarizeBranchDiff(DIFF)).toMatchObject({
      spaces: 2,
      total: 3,
      added: 1,
      removed: 1,
      modified: 1,
      byCapability: {
        key_value: { added: 1, removed: 0, modified: 1, total: 2 },
        json: { added: 0, removed: 1, modified: 0, total: 1 },
      },
    });
  });

  it("renders decoded identities with base64 preserved", () => {
    const parsed = JSON.parse(renderBranchDiffDocument("/db", DIFF, 1_700_000_000_000_000));

    expect(parsed.summary.total).toBe(3);
    expect(parsed.as_of.utc).toBe("2023-11-14T22:13:20.000000Z");
    expect(parsed.spaces[0].added[0]).toEqual({
      identity: "agent:new",
      base64: encodeUtf8("agent:new"),
      version: 7,
    });
  });
});
