/**
 * Socket discovery (AR-2.2), mirroring the executor's own resolve_connect
 * rules (crates/executor/src/ipc/mod.rs): `<data_dir>/strata.sock` first,
 * then the `strata.sock.path` pointer file a runtime-dir fallback leaves
 * behind, existence-checked. Connectability is the caller's concern — a
 * stale path connects-then-fails cleanly.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const SOCKET_NAME = "strata.sock";
const POINTER_NAME = "strata.sock.path";
const PID_NAME = "strata.pid";

export function resolveSocketPath(dbPath: string): string | null {
  const direct = path.join(dbPath, SOCKET_NAME);
  if (fs.existsSync(direct)) return direct;
  const pointer = path.join(dbPath, POINTER_NAME);
  try {
    const target = fs.readFileSync(pointer, "utf8").trim();
    if (target && fs.existsSync(target)) return target;
  } catch {
    // no pointer file
  }
  return null;
}

/** The hosting owner's recorded pid, or null when absent/unreadable. */
export function readOwnerPid(dbPath: string): number | null {
  try {
    const raw = fs.readFileSync(path.join(dbPath, PID_NAME), "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means "alive but not ours" — still alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
