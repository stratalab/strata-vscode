import type {
  DatasetCard,
  DatasetFacets,
  DatasetListParams,
  DatasetSummary,
  EffectiveHub,
  HubInfo,
  RefList,
} from "./catalog";
import type { CloneProgressEvent } from "./clone";

export interface HubBootstrapData {
  hub: EffectiveHub;
  info: HubInfo | null;
  binaryAvailable: boolean;
  trusted: boolean;
  canClone: boolean;
}

export interface HubListData {
  page: {
    total: number;
    offset: number;
    limit: number;
    items: DatasetSummary[];
    facets?: DatasetFacets;
  };
  hub: EffectiveHub;
  stale: boolean;
}

export interface HubDetailData {
  card: DatasetCard;
  refs: RefList | null;
  hub: EffectiveHub;
  stale: boolean;
}

export interface HubCloneData {
  cloned: boolean;
  dataset: string;
  branch: string;
  dest: string | null;
  manifestHash: string | null;
  objectCount: number | null;
  totalBytes: number | null;
  progressSupported: boolean;
  report: unknown | null;
}

export type HubCloneProgressData = CloneProgressEvent;

export interface HubErrorShape {
  message: string;
  code: string | null;
  status: number | null;
  retryable: boolean;
}

export type HubViewOp =
  | { op: "bootstrap"; force?: boolean }
  | { op: "list"; params: DatasetListParams; force?: boolean }
  | { op: "detail"; name: string; force?: boolean }
  | { op: "clone"; name: string; branch: string }
  | { op: "open-clone"; dest: string; branch: string }
  | { op: "reveal-clone"; dest: string }
  | { op: "copy-path"; dest: string }
  | { op: "change-hub" }
  | { op: "use-default-hub" }
  | { op: "set-global-hub" };

export interface HubRequestMsg {
  kind: "request";
  reqId: number;
  payload: HubViewOp;
}

export type HubToExt = HubRequestMsg | { kind: "ready" };

export type ExtToHub =
  | { kind: "response"; reqId: number; ok: true; data: unknown }
  | { kind: "response"; reqId: number; ok: false; error: HubErrorShape }
  | { kind: "event"; event: "clone-progress"; data: HubCloneProgressData };
