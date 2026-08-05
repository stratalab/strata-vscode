/**
 * Real-host harness (E3): durable temp databases, `strata start` owners with
 * parsed readiness reports, one-shot CLI seeding that brokers through a
 * running owner, and owner-kill helpers — mirroring strata-core's
 * crates/cli/tests/ipc_start_stop.rs topology.
 *
 * Note on paths: databases live under os.tmpdir(), not the session
 * scratchpad — Unix socket paths are capped (~104 bytes on macOS) and the
 * socket lives inside the database directory.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const READY_TIMEOUT_MS = 15_000;

export class TestDb {
  private constructor(
    readonly root: string,
    readonly dbPath: string,
    private readonly bin: string,
  ) {}

  static create(bin: string): TestDb {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "svdb-"));
    return new TestDb(root, path.join(root, "db"), bin);
  }

  /** One-shot CLI invocation against this database (creates it on first write). */
  cli(args: string[]): string {
    return execFileSync(this.bin, ["--db", this.dbPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, STRATA_DB: "" },
    });
  }

  /** Seeds KV pairs via one-shot writes (brokers through a host when one runs). */
  seedKv(entries: Array<[key: string, value: string]>): void {
    for (const [key, value] of entries) {
      this.cli(["kv", "put", key, value]);
    }
  }

  cleanup(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

export interface ReadinessReport {
  type: string;
  data: { hosting: boolean; is_owner: boolean; socket_path: string; [extra: string]: unknown };
}

export class StartedHost {
  private constructor(
    private readonly child: ChildProcess,
    readonly report: ReadinessReport,
    private readonly db: TestDb,
  ) {}

  get socketPath(): string {
    return this.report.data.socket_path;
  }

  get pid(): number {
    return this.child.pid ?? -1;
  }

  /** Spawns `strata --db <db> --json start` and waits for the readiness line. */
  static start(db: TestDb, bin: string): Promise<StartedHost> {
    const child = spawn(bin, ["--db", db.dbPath, "--json", "start"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, STRATA_DB: "" },
    });
    return new Promise<StartedHost>((resolve, reject) => {
      let buffered = "";
      let stderrText = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`strata start: no readiness report in ${READY_TIMEOUT_MS} ms; stderr: ${stderrText}`));
      }, READY_TIMEOUT_MS);
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrText += chunk.toString("utf8");
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        const newline = buffered.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timer);
        child.stdout?.removeAllListeners("data");
        try {
          const report = JSON.parse(buffered.slice(0, newline)) as ReadinessReport;
          if (report.type !== "ipc_started" || !report.data?.socket_path) {
            reject(new Error(`unexpected readiness report: ${buffered}`));
            return;
          }
          resolve(new StartedHost(child, report, db));
        } catch (error) {
          reject(new Error(`readiness line is not JSON (${String(error)}): ${buffered}`));
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`strata start exited early (code ${code}); stderr: ${stderrText}`));
      });
    });
  }

  /** Clean stop via `strata stop` semantics; waits for the host to exit. */
  async stop(bin: string): Promise<void> {
    try {
      execFileSync(bin, ["--db", this.db.dbPath, "--json", "stop"], {
        encoding: "utf8",
        env: { ...process.env, STRATA_DB: "" },
      });
    } catch {
      // Host may already be gone (owner-death scenarios).
    }
    await this.waitExit(5_000);
    this.child.kill("SIGKILL");
  }

  /** Owner-death scenario: the host vanishes without ceremony. */
  kill(): void {
    this.child.kill("SIGKILL");
  }

  waitExit(timeoutMs: number): Promise<number | null> {
    if (this.child.exitCode !== null) return Promise.resolve(this.child.exitCode);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.child.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }
}
