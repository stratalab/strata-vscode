/**
 * Status bar content (AR-3.5), pure: renders `admin.ipc_status` — owner pid,
 * hosting state, and every attached client as its hello introduced it, with
 * this extension's own entry highlighted and protocol-1 connections shown as
 * "unidentified client".
 */
import type { AdminIpcStatus } from "../generated";
import type { ClientIdentity } from "../wire/protocol";

export interface DatabaseStatus {
  dbPath: string;
  stateDescription: string;
  ipcStatus?: AdminIpcStatus;
}

export interface StatusRendering {
  text: string;
  tooltipMarkdown: string;
}

export function renderStatus(
  databases: DatabaseStatus[],
  self: ClientIdentity,
): StatusRendering {
  const attached = databases.filter((d) => d.ipcStatus !== undefined);
  const text =
    attached.length === 0
      ? "$(database) StrataDB"
      : `$(database) StrataDB: ${attached.length} attached`;

  const sections = databases.map((db) => {
    const lines: string[] = [`**${db.dbPath}** — ${db.stateDescription}`];
    const status = db.ipcStatus;
    if (status) {
      lines.push(
        `owner pid ${status.owner_pid ?? "unknown"} · ${status.hosting ? "hosting" : "not hosting"} · ${status.client_count} client(s)`,
      );
      for (const client of status.clients ?? []) {
        const isSelf =
          client.name === self.name && client.pid != null && client.pid === self.pid;
        const name =
          client.protocol < 2 || !client.name
            ? "unidentified client"
            : `${client.name}${client.version ? ` ${client.version}` : ""}`;
        const pid = client.pid != null ? ` (pid ${client.pid})` : "";
        const marker = isSelf ? " ← this window" : "";
        lines.push(`- ${isSelf ? `**${name}**` : name}${pid} · ${client.access} · protocol ${client.protocol}${marker}`);
      }
    }
    return lines.join("\n\n");
  });

  return { text, tooltipMarkdown: sections.join("\n\n---\n\n") || "No Strata databases found." };
}
