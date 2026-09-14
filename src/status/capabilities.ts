import { COMMANDS, STRATA_CORE_REV } from "../generated";
import type { BinaryStatus, CapabilityStatus, HubStatus, McpStatus } from "./shared";

export const REQUIRED_ENGINE_VERSION = "1.2.2";

export function capabilityStatus(
  binary: BinaryStatus,
  hub: HubStatus,
  mcp: McpStatus,
): CapabilityStatus[] {
  const modern = binaryMeetsMinimum(binary);
  const noBinaryLevel = binary.found ? "warn" : "bad";
  const engineDetail = binary.version
    ? `Installed ${binary.version}; extension target is ${REQUIRED_ENGINE_VERSION}+`
    : `Install strata ${REQUIRED_ENGINE_VERSION}+`;
  return [
    {
      id: "engine-1.2.2",
      label: "Engine 1.2.2",
      detail: engineDetail,
      level: modern ? "ok" : noBinaryLevel,
      available: modern,
    },
    {
      id: "hub-browse",
      label: "Hub browse commands",
      detail: commandStatusDetail(["hub.info", "hub.list_datasets", "hub.get_dataset", "hub.list_refs"]),
      level: modern && hasCommands(["hub.info", "hub.list_datasets", "hub.get_dataset", "hub.list_refs"]) ? "ok" : noBinaryLevel,
      available: modern && hasCommands(["hub.info", "hub.list_datasets", "hub.get_dataset", "hub.list_refs"]),
    },
    {
      id: "clone-progress",
      label: "Clone progress",
      detail: modern ? "strata clone --progress jsonl is supported by this release line." : `Requires strata ${REQUIRED_ENGINE_VERSION}+ for current UX support.`,
      level: modern ? "ok" : noBinaryLevel,
      available: modern,
    },
    {
      id: "kv-prefix",
      label: "KV prefix paging",
      detail: commandStatusDetail(["kv.list", "kv.count"]),
      level: modern && hasCommands(["kv.list", "kv.count"]) ? "ok" : noBinaryLevel,
      available: modern && hasCommands(["kv.list", "kv.count"]),
    },
    {
      id: "committed-at",
      label: "Wall-clock commits",
      detail: modern ? "History and point reads can expose committed_at where the engine returns it." : `Requires strata ${REQUIRED_ENGINE_VERSION}+ for the fixed timestamp contract.`,
      level: modern ? "ok" : noBinaryLevel,
      available: modern,
    },
    {
      id: "no-human-output",
      label: "Machine output contract",
      detail: modern ? "Structured JSON/wire output is safe for extension control paths." : `Requires strata ${REQUIRED_ENGINE_VERSION}+ for the current CLI output contract.`,
      level: modern ? "ok" : noBinaryLevel,
      available: modern,
    },
    {
      id: "hub-url",
      label: "Hub URL",
      detail: `${hub.url} (${hub.source})`,
      level: hub.warning ? "warn" : "ok",
      available: true,
    },
    {
      id: "mcp-registration",
      label: "MCP registration",
      detail: mcp.message,
      level: mcp.level,
      available: mcp.level === "ok" || mcp.level === "info",
    },
    {
      id: "idl-pin",
      label: "Vendored IDL",
      detail: `strata-core ${STRATA_CORE_REV.slice(0, 12)}`,
      level: "ok",
      available: true,
    },
  ];
}

export function binaryMeetsMinimum(binary: BinaryStatus): boolean {
  return binary.found && versionMeetsMinimum(binary.version);
}

export function versionMeetsMinimum(version: string | null): boolean {
  if (!version) return false;
  const parsed = parseVersion(version);
  return parsed !== null && compareVersion(parsed, REQUIRED_ENGINE_VERSION) >= 0;
}

function hasCommands(ids: string[]): boolean {
  return ids.every((id) => Object.prototype.hasOwnProperty.call(COMMANDS, id));
}

function commandStatusDetail(ids: string[]): string {
  const missing = ids.filter((id) => !hasCommands([id]));
  return missing.length === 0
    ? `${ids.join(", ")} are present in the vendored command catalog.`
    : `Missing from vendored catalog: ${missing.join(", ")}`;
}

function parseVersion(text: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(current: [number, number, number], required: string): number {
  const parsed = parseVersion(required);
  if (!parsed) return 0;
  for (let index = 0; index < 3; index += 1) {
    const delta = current[index]! - parsed[index]!;
    if (delta !== 0) return delta;
  }
  return 0;
}
