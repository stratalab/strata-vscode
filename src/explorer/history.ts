/**
 * History timelines (F2.3): per-key/document version lists that drive the
 * scrubber. `history_unavailable.*` and unretained-version errors are
 * first-class results here, never toasts (F2.5).
 */
import type { InteractiveClient } from "../wire/client";
import { CommandFailedError } from "../wire/errors";
import type { WireBase64 } from "../wire/bytes";
import { previewValue } from "./decode";
import type { Scope } from "./model";

export interface TimelineEntry {
  version: number;
  /** Microseconds — the scrub position this version corresponds to. */
  timestamp: number;
  tombstone: boolean;
  preview: string | null;
}

export type TimelineResult =
  | { kind: "timeline"; entries: TimelineEntry[] }
  | { kind: "unavailable"; reason: string };

function unavailableFrom(error: unknown): TimelineResult | null {
  if (error instanceof CommandFailedError && error.errorClass === "history_unavailable") {
    return {
      kind: "unavailable",
      reason: error.message || "history is not retained for this database",
    };
  }
  return null;
}

export async function kvTimeline(
  client: InteractiveClient,
  scope: Scope,
  key: WireBase64,
): Promise<TimelineResult> {
  try {
    const response = await client.request(
      "kv.history",
      { key, branch: scope.branch, space: scope.space },
      { branch: scope.branch, space: scope.space },
    );
    const items = response.data?.items ?? [];
    return {
      kind: "timeline",
      entries: items.map((item) => ({
        version: item.version,
        timestamp: item.timestamp,
        tombstone: item.tombstone,
        preview: item.value != null ? previewValue(item.value) : null,
      })),
    };
  } catch (error) {
    const unavailable = unavailableFrom(error);
    if (unavailable) return unavailable;
    throw error;
  }
}

export async function jsonTimeline(
  client: InteractiveClient,
  scope: Scope,
  docId: string,
): Promise<TimelineResult> {
  try {
    const response = await client.request(
      "json.history",
      { key: docId, branch: scope.branch, space: scope.space },
      { branch: scope.branch, space: scope.space },
    );
    const items = response.data ?? [];
    return {
      kind: "timeline",
      entries: items.map((item) => ({
        version: item.version,
        timestamp: item.timestamp,
        tombstone: item.tombstone,
        preview:
          item.value !== undefined && item.value !== null
            ? JSON.stringify(item.value).slice(0, 80)
            : null,
      })),
    };
  } catch (error) {
    const unavailable = unavailableFrom(error);
    if (unavailable) return unavailable;
    throw error;
  }
}
