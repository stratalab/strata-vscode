import { MANAGED_KEY_RE, type McpServerEntry } from "./registration";

export type McpConfigState = "registered" | "missing" | "stale" | "malformed" | "idle";

export interface McpConfigInspection {
  state: McpConfigState;
  managedEntries: string[];
  missingEntries: string[];
  reason: string | null;
}

interface McpConfig {
  mcpServers?: Record<string, unknown>;
}

export function inspectMcpConfig(
  existing: string | null,
  expected: Record<string, McpServerEntry>,
): McpConfigInspection {
  const expectedEntries = Object.keys(expected).sort();
  if (expectedEntries.length === 0) {
    return { state: "idle", managedEntries: [], missingEntries: [], reason: null };
  }
  if (existing === null) {
    return { state: "missing", managedEntries: [], missingEntries: expectedEntries, reason: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch (error) {
    return {
      state: "malformed",
      managedEntries: [],
      missingEntries: expectedEntries,
      reason: `not valid JSON (${String(error)})`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      state: "malformed",
      managedEntries: [],
      missingEntries: expectedEntries,
      reason: "config is not a JSON object",
    };
  }

  const servers = (parsed as McpConfig).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return { state: "missing", managedEntries: [], missingEntries: expectedEntries, reason: null };
  }

  const managedEntries = Object.keys(servers).filter((key) => MANAGED_KEY_RE.test(key)).sort();
  const missingEntries = expectedEntries.filter((key) => !entryMatches(servers[key], expected[key]!));
  const staleEntries = managedEntries.filter((key) => !(key in expected) || !entryMatches(servers[key], expected[key]!));
  const state = missingEntries.length === 0 && staleEntries.length === 0 ? "registered" : "stale";
  return {
    state,
    managedEntries,
    missingEntries,
    reason: staleEntries.length > 0 ? `stale entries: ${staleEntries.join(", ")}` : null,
  };
}

function entryMatches(value: unknown, expected: McpServerEntry): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return raw.command === expected.command && arrayMatches(raw.args, expected.args);
}

function arrayMatches(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index]);
}
