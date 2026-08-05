/**
 * File-based MCP registration (F6.2/F6.3): the entries written to
 * `.cursor/mcp.json` and `.mcp.json`. Vscode-free and pure — the writers
 * are idempotent (unchanged input → byte-identical output), merge-safe
 * (foreign entries are never touched; malformed files are refused, never
 * overwritten), and reversible (removal deletes exactly the entries this
 * extension manages).
 *
 * Registration is workspace-scoped, not per-database (F6.3): one `strata`
 * entry pinned to the workspace's primary database; multi-database
 * workspaces get named entries as the transitional shape until the MCP
 * server grows workspace discovery upstream.
 */
import * as path from "node:path";

export interface McpServerEntry {
  command: string;
  args: string[];
}

/** Keys this extension owns: exactly "strata" or "strata-<name>". */
export const MANAGED_KEY_RE = /^strata(-|$)/;

export function buildStrataEntries(
  dbPaths: string[],
  binary: string,
): Record<string, McpServerEntry> {
  const sorted = [...dbPaths].sort();
  const entry = (dbPath: string): McpServerEntry => ({
    command: binary, // the resolved machine-scoped path, never workspace-relative (F6.4)
    args: ["--db", dbPath, "mcp", "serve"],
  });
  if (sorted.length === 0) return {};
  if (sorted.length === 1) return { strata: entry(sorted[0]!) };
  const entries: Record<string, McpServerEntry> = {};
  const seen = new Map<string, number>();
  for (const dbPath of sorted) {
    let name = `strata-${path.basename(dbPath).replace(/[^A-Za-z0-9_.-]/g, "_")}`;
    const clashes = seen.get(name) ?? 0;
    seen.set(name, clashes + 1);
    if (clashes > 0) name = `${name}-${clashes + 1}`;
    entries[name] = entry(dbPath);
  }
  return entries;
}

export type WriteOutcome =
  | { kind: "updated"; content: string }
  | { kind: "unchanged" }
  | { kind: "refused"; reason: string };

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [extra: string]: unknown;
}

export function applyStrataEntries(
  existing: string | null,
  entries: Record<string, McpServerEntry>,
): WriteOutcome {
  const parsed = parseConfig(existing);
  if (parsed.kind === "refused") return parsed;
  const config = parsed.config;
  const servers = { ...(config.mcpServers ?? {}) };

  // Drop stale managed entries (a database left the workspace), keep foreign.
  for (const key of Object.keys(servers)) {
    if (MANAGED_KEY_RE.test(key) && !(key in entries)) delete servers[key];
  }
  for (const [key, entry] of Object.entries(entries)) {
    servers[key] = entry;
  }

  const updated = render({ ...config, mcpServers: servers });
  if (existing !== null && updated === existing) return { kind: "unchanged" };
  return { kind: "updated", content: updated };
}

export function removeStrataEntries(existing: string | null): WriteOutcome {
  if (existing === null) return { kind: "unchanged" };
  const parsed = parseConfig(existing);
  if (parsed.kind === "refused") return parsed;
  const config = parsed.config;
  const servers = { ...(config.mcpServers ?? {}) };
  let changed = false;
  for (const key of Object.keys(servers)) {
    if (MANAGED_KEY_RE.test(key)) {
      delete servers[key];
      changed = true;
    }
  }
  if (!changed) return { kind: "unchanged" };
  const updated = render({ ...config, mcpServers: servers });
  return updated === existing ? { kind: "unchanged" } : { kind: "updated", content: updated };
}

function parseConfig(
  existing: string | null,
): { kind: "ok"; config: McpConfig } | { kind: "refused"; reason: string } {
  if (existing === null || existing.trim() === "") return { kind: "ok", config: {} };
  try {
    const value = JSON.parse(existing) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { kind: "refused", reason: "existing config is not a JSON object" };
    }
    return { kind: "ok", config: value as McpConfig };
  } catch (error) {
    // F6.2: refuse and report — never overwrite a file we cannot parse.
    return { kind: "refused", reason: `existing config is not valid JSON (${String(error)})` };
  }
}

function render(config: McpConfig): string {
  return JSON.stringify(config, null, 2) + "\n";
}
