/**
 * Branch comparison (F2.4): the same key/document read on two branches,
 * rendered for a side-by-side client-side diff — no engine diff surface
 * exists, and none is needed for V1.
 */
import type { InteractiveClient } from "../wire/client";
import type { WireBase64 } from "../wire/bytes";
import { inspectJson, inspectKv, type Inspection } from "./inspector";
import type { Scope } from "./model";

export interface BranchComparison {
  left: Inspection & { branch: string };
  right: Inspection & { branch: string };
}

export async function compareKvAcrossBranches(
  client: InteractiveClient,
  scope: Scope,
  key: WireBase64,
  otherBranch: string,
): Promise<BranchComparison> {
  const [left, right] = await Promise.all([
    inspectKv(client, scope, key),
    inspectKv(client, { ...scope, branch: otherBranch }, key),
  ]);
  return {
    left: { ...left, branch: scope.branch },
    right: { ...right, branch: otherBranch },
  };
}

export async function compareJsonAcrossBranches(
  client: InteractiveClient,
  scope: Scope,
  docId: string,
  otherBranch: string,
): Promise<BranchComparison> {
  const [left, right] = await Promise.all([
    inspectJson(client, scope, docId),
    inspectJson(client, { ...scope, branch: otherBranch }, docId),
  ]);
  return {
    left: { ...left, branch: scope.branch },
    right: { ...right, branch: otherBranch },
  };
}
