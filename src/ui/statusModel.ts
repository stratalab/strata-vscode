/**
 * Status bar content (AR-3.5, redesigned per SB-1/SB-2), pure: renders
 * `admin.ipc_status` — owner pid, hosting state, and every attached client
 * as its hello introduced it, with this extension's own entry highlighted
 * and protocol-1 connections shown as "unidentified client".
 *
 * The item hides when no databases exist (status-bar economy), and turns
 * into the amber history state when any database is scrubbed — the
 * window-level expression of "you are looking at the past" (SIG-2).
 */
import type { AdminIpcStatus } from "../generated";
import type { ClientIdentity } from "../wire/protocol";

export interface DatabaseStatus {
  dbPath: string;
  stateDescription: string;
  /** Humanized scrub position, or null/absent when live (F2.2). */
  scrubbedTo?: string | null;
  /** Change events per minute, oldest first — the tooltip's pulse line. */
  activity?: number[];
  ipcStatus?: AdminIpcStatus;
}

export interface StatusRendering {
  /** False when there is nothing to say — the item leaves the status bar. */
  visible: boolean;
  /** True when any database is scrubbed — the item wears the warning tint. */
  warning: boolean;
  text: string;
  tooltipMarkdown: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const SPARKS = "▁▂▃▄▅▆▇█";

/** Text sparkline scaled to the window's own maximum (U11). */
export function sparkline(counts: number[]): string {
  const max = Math.max(...counts, 1);
  return counts
    .map((n) => (n <= 0 ? SPARKS[0] : SPARKS[Math.min(7, Math.round((n / max) * 7))]))
    .join("");
}

function basename(dbPath: string): string {
  return dbPath.split("/").pop() ?? dbPath;
}

/** One database's tooltip section — shared with the explorer's hover card. */
export function renderDatabaseSection(db: DatabaseStatus, self: ClientIdentity): string {
  const lines: string[] = [`**${basename(db.dbPath)}** — ${db.stateDescription}`, `\`${db.dbPath}\``];
  if (db.scrubbedTo) {
    lines.push(`$(history) as of ${db.scrubbedTo} — live refresh suspended`);
  }
  if (db.activity && db.activity.some((n) => n > 0)) {
    lines.push(`$(pulse) ${sparkline(db.activity)} changes/min, last ${db.activity.length}m`);
  }
  const status = db.ipcStatus;
  if (status) {
    lines.push(
      `owner pid ${status.owner_pid ?? "unknown"} · ${status.hosting ? "hosting" : "not hosting"} · ${plural(status.client_count, "client")}`,
    );
    const clients = status.clients ?? [];
    if (clients.length > 0) {
      const rows = clients.map((client) => {
        const isSelf =
          client.name === self.name && client.pid != null && client.pid === self.pid;
        const name =
          client.protocol < 2 || !client.name
            ? "unidentified client"
            : `${client.name}${client.version ? ` ${client.version}` : ""}`;
        const nameCell = isSelf ? `**${name}** ← this window` : name;
        return `| ${nameCell} | ${client.pid ?? "—"} | ${client.access} | ${client.protocol} |`;
      });
      lines.push(["| client | pid | access | protocol |", "| --- | --- | --- | --- |", ...rows].join("\n"));
    }
  }
  return lines.join("\n\n");
}

export function renderStatus(
  databases: DatabaseStatus[],
  self: ClientIdentity,
): StatusRendering {
  if (databases.length === 0) {
    return { visible: false, warning: false, text: "", tooltipMarkdown: "" };
  }

  const attached = databases.filter((d) => d.ipcStatus !== undefined);
  const scrubbed = databases.filter((d) => d.scrubbedTo);
  const warning = scrubbed.length > 0;

  const text = warning
    ? scrubbed.length === 1
      ? `$(history) StrataDB · as of ${scrubbed[0]!.scrubbedTo}`
      : `$(history) StrataDB · ${plural(scrubbed.length, "database")} in the past`
    : attached.length === 0
      ? "$(database) StrataDB"
      : `$(database) StrataDB: ${attached.length} attached`;

  const tooltipMarkdown = databases
    .map((db) => renderDatabaseSection(db, self))
    .join("\n\n---\n\n");

  return { visible: true, warning, text, tooltipMarkdown };
}
