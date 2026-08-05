/**
 * The console palette (F3.1): the catalog grouped by family, searchable by
 * id/title/summary from the vendored IDL prose. Write commands appear greyed
 * with the read-only reason (AR-4.2) — discoverability without capability.
 * The inference family is not surfaced at all (§2).
 */
import { COMMANDS, COMMAND_IDS, type CommandId } from "../generated";
import { classifyCommand, type RequestClass } from "../wire/client";

export interface PaletteItem {
  commandId: CommandId;
  family: string;
  title: string;
  summary: string;
  access: "read" | "write";
  runnable: boolean;
  requestClass: RequestClass;
  /** Wire-only commands have no CLI verb (AR-1.6) — shown as a hint. */
  wireOnly: boolean;
}

export const READ_ONLY_REASON = "StrataDB for VS Code v1 is read-only";

export function buildPalette(): PaletteItem[] {
  return COMMAND_IDS.filter((id) => COMMANDS[id].family !== "inference")
    .map((id) => {
      const entry = COMMANDS[id];
      return {
        commandId: id,
        family: entry.family,
        title: entry.title,
        summary: entry.summary,
        access: entry.access,
        runnable: entry.access === "read",
        requestClass: classifyCommand(entry),
        wireOnly: entry.cliSurface === "wire",
      };
    })
    .sort((a, b) =>
      a.family === b.family
        ? a.commandId.localeCompare(b.commandId)
        : a.family.localeCompare(b.family),
    );
}
