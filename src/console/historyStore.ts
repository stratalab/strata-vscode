/**
 * Console history (F3.6): per-workspace, replayable, capped. Entries store
 * the exact payload sent so a replay is byte-faithful.
 */
import type { CommandId } from "../generated";

export interface ConsoleHistoryEntry {
  commandId: CommandId;
  payload: Record<string, unknown>;
  branch: string;
  space?: string;
  at: string; // ISO timestamp — display only
}

export interface HistoryPersistence {
  loadConsoleHistory(): ConsoleHistoryEntry[];
  saveConsoleHistory(entries: ConsoleHistoryEntry[]): void;
}

const HISTORY_CAP = 100;

export class ConsoleHistoryStore {
  private entries: ConsoleHistoryEntry[];

  constructor(private readonly persistence: HistoryPersistence) {
    this.entries = persistence.loadConsoleHistory();
  }

  list(): ConsoleHistoryEntry[] {
    return [...this.entries];
  }

  record(entry: ConsoleHistoryEntry): void {
    this.entries = [entry, ...this.entries].slice(0, HISTORY_CAP);
    this.persistence.saveConsoleHistory(this.entries);
  }

  clear(): void {
    this.entries = [];
    this.persistence.saveConsoleHistory(this.entries);
  }
}
