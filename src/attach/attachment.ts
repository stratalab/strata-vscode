/**
 * The closed attachment-state set (F1.6): every database renders exactly one
 * of these, each a teaching state rather than an error toast. Probing is
 * attach-first (AR-3.1): if a socket answers, we are a client; the extension
 * never takes the writer lock.
 */
import { IDL_STAMPS } from "../generated/stamps";
import { WireConnection } from "../wire/connection";
import { HelloRefusedError, OwnerAtCapacityError } from "../wire/errors";
import type { ServerHello } from "../wire/protocol";
import { classifyLayout } from "./discovery";
import { isPidAlive, readOwnerPid, resolveSocketPath } from "./socketDiscovery";

export type AttachmentState =
  | { kind: "attachable"; socketPath: string; hello: ServerHello; skewMatches: boolean }
  | { kind: "unowned" }
  | { kind: "owned-unreachable"; pid: number | null }
  | { kind: "at-capacity"; socketPath: string }
  | { kind: "version-mismatch"; detail: string }
  | { kind: "pre-v1-layout" }
  | { kind: "not-a-database" };

/** Human copy for each state — the teaching-state text (F1.6). */
export function describeState(state: AttachmentState): string {
  switch (state.kind) {
    case "attachable":
      return state.skewMatches
        ? "attached (live)"
        : "attached — owner speaks a different IDL revision; unknown commands are hidden";
    case "unowned":
      return "no owner process — start a database host to browse";
    case "owned-unreachable":
      return state.pid !== null
        ? `owned by pid ${state.pid} but not reachable (owner runs without IPC hosting)`
        : "owned by another process but not reachable (owner runs without IPC hosting)";
    case "at-capacity":
      return "owner is at its connection capacity — retry shortly";
    case "version-mismatch":
      return `owner refused the connection: ${state.detail}`;
    case "pre-v1-layout":
      return "pre-V1 database layout — recreate the database with a V1 strata build (clean-break policy)";
    case "not-a-database":
      return "not a Strata database (cache-mode databases leave nothing on disk and are unreachable by design)";
  }
}

/** Probe hook so tests can script wire outcomes without a socket. */
export type SocketProbe = (socketPath: string) => Promise<ServerHello>;

export async function defaultProbe(socketPath: string): Promise<ServerHello> {
  const connection = await WireConnection.connect(socketPath, { helloTimeoutMs: 3_000 });
  const hello = connection.serverHello;
  connection.close();
  return hello;
}

export async function determineState(
  dbPath: string,
  probe: SocketProbe = defaultProbe,
  pidAlive: (pid: number) => boolean = isPidAlive,
): Promise<AttachmentState> {
  const layout = classifyLayout(dbPath);
  if (layout === "pre-v1") return { kind: "pre-v1-layout" };
  if (layout === "not-a-database") return { kind: "not-a-database" };

  const socketPath = resolveSocketPath(dbPath);
  if (socketPath !== null) {
    try {
      const hello = await probe(socketPath);
      const skewMatches =
        hello.idl.schema_version === IDL_STAMPS.schemaVersion &&
        hello.idl.generator_version === IDL_STAMPS.generatorVersion;
      return { kind: "attachable", socketPath, hello, skewMatches };
    } catch (error) {
      if (error instanceof OwnerAtCapacityError) return { kind: "at-capacity", socketPath };
      if (error instanceof HelloRefusedError) {
        return { kind: "version-mismatch", detail: error.envelope.message ?? error.envelope.code };
      }
      // Stale socket file (owner died): fall through to the pid/lock facts.
    }
  }

  const pid = readOwnerPid(dbPath);
  if (pid !== null && pidAlive(pid)) return { kind: "owned-unreachable", pid };
  return { kind: "unowned" };
}
