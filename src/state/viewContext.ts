/**
 * Per-database view context: the selected branch (F2.1, persisted per
 * workspace — AR-8.3) and the time-travel scrub position (F2.2, session-only
 * by design: every reload returns to "now").
 */
import { formatMicrosAbsolute } from "../views/shared/format";

export interface BranchPersistence {
  loadBranches(): Record<string, string>;
  saveBranches(map: Record<string, string>): void;
}

export const DEFAULT_BRANCH = "default";

export class ViewContextStore {
  private branches: Record<string, string>;
  private asOf = new Map<string, number>();
  private readonly changeListeners: Array<(dbPath: string) => void> = [];

  constructor(private readonly persistence: BranchPersistence) {
    this.branches = persistence.loadBranches();
  }

  onDidChange(listener: (dbPath: string) => void): void {
    this.changeListeners.push(listener);
  }

  branchFor(dbPath: string): string {
    return this.branches[dbPath] ?? DEFAULT_BRANCH;
  }

  setBranch(dbPath: string, branch: string): void {
    this.branches = { ...this.branches, [dbPath]: branch };
    this.persistence.saveBranches(this.branches);
    this.emit(dbPath);
  }

  /** Scrub position in microseconds, or null when live ("now"). */
  asOfFor(dbPath: string): number | null {
    return this.asOf.get(dbPath) ?? null;
  }

  isScrubbed(dbPath: string): boolean {
    return this.asOf.has(dbPath);
  }

  setAsOf(dbPath: string, micros: number | null): void {
    if (micros === null) this.asOf.delete(dbPath);
    else this.asOf.set(dbPath, micros);
    this.emit(dbPath);
  }

  /** Human rendering of the scrub position for scope banners (F4.6 spirit). */
  describeAsOf(dbPath: string): string | null {
    const micros = this.asOfFor(dbPath);
    if (micros === null) return null;
    // Absolute, never relative: a scrub position must read unambiguously
    // (XC-4); the exact microsecond form rides on the banner's hover.
    return formatMicrosAbsolute(micros);
  }

  private emit(dbPath: string): void {
    for (const listener of [...this.changeListeners]) listener(dbPath);
  }
}
