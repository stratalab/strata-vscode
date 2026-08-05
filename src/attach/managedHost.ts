/**
 * Managed hosts (AR-3.2, AR-8.1): the extension may start `strata start <db>`
 * for an unowned database, tie its lifetime to the workspace session, and
 * stop it on deactivation. A host orphaned by a hard editor death keeps
 * serving — it is a legitimate owner — and the next activation re-adopts it
 * from the recorded pid rather than starting a second.
 *
 * Untrusted workspaces never spawn anything (AR-7.5) — enforced here, not
 * just in UI affordances.
 */
import { execFile, spawn } from "node:child_process";
import { isPidAlive } from "./socketDiscovery";

const READY_TIMEOUT_MS = 15_000;

export interface ManagedHostRecord {
  dbPath: string;
  pid: number;
  socketPath: string;
  startedAt: string;
}

/** Persistence seam (AR-8.3) — vscode Memento in production, a map in tests. */
export interface HostPersistence {
  loadHosts(): ManagedHostRecord[];
  saveHosts(records: ManagedHostRecord[]): void;
}

export class WorkspaceNotTrustedError extends Error {
  constructor() {
    super("untrusted workspace: StrataDB is attach-only and never spawns processes (AR-7.5)");
    this.name = "WorkspaceNotTrustedError";
  }
}

export class StrataBinaryMissingError extends Error {
  constructor() {
    super("no strata binary: set strata.binaryPath or install strata on PATH");
    this.name = "StrataBinaryMissingError";
  }
}

interface ReadinessReport {
  type: string;
  data: { hosting: boolean; is_owner: boolean; socket_path: string };
}

export class ManagedHostManager {
  private records: ManagedHostRecord[];

  constructor(
    private readonly binary: string | null,
    private readonly persistence: HostPersistence,
    private readonly trusted: boolean,
    private readonly pidAlive: (pid: number) => boolean = isPidAlive,
  ) {
    this.records = persistence.loadHosts();
  }

  /**
   * AR-8.1: on activation, records whose pid still serves are re-adopted as
   * managed; dead ones are forgotten.
   */
  adoptOrForget(): ManagedHostRecord[] {
    this.records = this.records.filter((record) => this.pidAlive(record.pid));
    this.persistence.saveHosts(this.records);
    return [...this.records];
  }

  isManaged(dbPath: string): boolean {
    return this.records.some((record) => record.dbPath === dbPath);
  }

  /** Spawns a host for an unowned database and records it as managed. */
  startHost(dbPath: string): Promise<ManagedHostRecord> {
    if (!this.trusted) return Promise.reject(new WorkspaceNotTrustedError());
    const binary = this.binary;
    if (!binary) return Promise.reject(new StrataBinaryMissingError());

    return new Promise<ManagedHostRecord>((resolve, reject) => {
      const child = spawn(binary, ["--db", dbPath, "--json", "start"], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });
      let buffered = "";
      let stderrText = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`strata start: no readiness report in ${READY_TIMEOUT_MS} ms; ${stderrText}`));
      }, READY_TIMEOUT_MS);
      child.stderr?.on("data", (chunk: Buffer) => (stderrText += chunk.toString("utf8")));
      child.stdout?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        const newline = buffered.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timer);
        child.stdout?.removeAllListeners("data");
        try {
          const report = JSON.parse(buffered.slice(0, newline)) as ReadinessReport;
          if (report.type !== "ipc_started" || !report.data.socket_path) {
            reject(new Error(`unexpected start report: ${buffered.trim()}`));
            return;
          }
          const record: ManagedHostRecord = {
            dbPath,
            pid: child.pid ?? -1,
            socketPath: report.data.socket_path,
            startedAt: new Date().toISOString(),
          };
          this.records = [...this.records.filter((r) => r.dbPath !== dbPath), record];
          this.persistence.saveHosts(this.records);
          resolve(record);
        } catch (error) {
          reject(new Error(`start report is not JSON (${String(error)}): ${buffered.trim()}`));
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `strata start exited (code ${code}) — ${stderrText.includes("already owns") ? "another process already owns this database" : stderrText.trim() || "no detail"}`,
          ),
        );
      });
    });
  }

  /**
   * Stops one managed host via `strata stop` semantics (AR-3.2) — works even
   * for re-adopted hosts whose child handle died with the previous session.
   */
  async stopHost(dbPath: string): Promise<void> {
    const record = this.records.find((r) => r.dbPath === dbPath);
    if (!record) return;
    if (this.binary) {
      await new Promise<void>((resolve) => {
        execFile(this.binary!, ["--db", dbPath, "--json", "stop"], { timeout: 5_000 }, () =>
          resolve(),
        );
      });
    }
    this.records = this.records.filter((r) => r.dbPath !== dbPath);
    this.persistence.saveHosts(this.records);
  }

  /** AR-8.4: deactivation stops every managed host. */
  async stopAll(): Promise<void> {
    for (const record of [...this.records]) {
      await this.stopHost(record.dbPath);
    }
  }
}
