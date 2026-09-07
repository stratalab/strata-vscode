import type {
  BranchComparisonItem,
  ComparedCapability,
  ComparedEntityItem,
  SpaceComparisonItem,
} from "../generated";
import { keyLabel } from "../explorer/decode";
import { asWireBase64 } from "../wire/bytes";
import { exactMicros } from "../views/shared/format";

export interface BranchDiffSummary {
  spaces: number;
  total: number;
  added: number;
  removed: number;
  modified: number;
  byCapability: Partial<Record<ComparedCapability, { added: number; removed: number; modified: number; total: number }>>;
}

export function summarizeBranchDiff(diff: BranchComparisonItem): BranchDiffSummary {
  const summary: BranchDiffSummary = {
    spaces: diff.spaces.length,
    total: 0,
    added: 0,
    removed: 0,
    modified: 0,
    byCapability: {},
  };
  for (const space of diff.spaces) {
    const capability = summary.byCapability[space.capability] ?? { added: 0, removed: 0, modified: 0, total: 0 };
    for (const bucket of ["added", "removed", "modified"] as const) {
      const count = space[bucket].length;
      summary[bucket] += count;
      summary.total += count;
      capability[bucket] += count;
      capability.total += count;
    }
    summary.byCapability[space.capability] = capability;
  }
  return summary;
}

export function renderBranchDiffDocument(
  dbPath: string,
  diff: BranchComparisonItem,
  asOfMicros: number | null,
): string {
  return `${JSON.stringify(
    {
      database: dbPath,
      branch_a: diff.branch_a,
      branch_b: diff.branch_b,
      as_of: asOfMicros === null ? null : { micros: asOfMicros, utc: exactMicros(asOfMicros) },
      summary: summarizeBranchDiff(diff),
      spaces: diff.spaces.map(shapeSpaceComparison),
    },
    null,
    2,
  )}\n`;
}

function shapeSpaceComparison(space: SpaceComparisonItem): Record<string, unknown> {
  return {
    space: space.space,
    capability: space.capability,
    added: shapeEntities(space.added),
    removed: shapeEntities(space.removed),
    modified: shapeEntities(space.modified),
  };
}

function shapeEntities(items: ComparedEntityItem[]): Array<Record<string, unknown>> {
  return items.map((item) => ({
    identity: safeIdentityLabel(item.identity),
    base64: item.identity,
    version: item.version,
  }));
}

function safeIdentityLabel(value: string): string {
  try {
    return keyLabel(asWireBase64(value));
  } catch {
    return value;
  }
}
