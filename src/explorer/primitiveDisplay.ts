/**
 * The one mapping from primitive wire ids to display language (U5, TR-1) —
 * tree labels, panel titles, and codicons all read from here so the icon
 * and naming language never drifts between surfaces. Wire ids stay in
 * tooltips for precision; they are never labels (§7).
 */

export type PrimitiveId = "kv" | "json" | "events" | "vectors" | "graph";

export const PRIMITIVE_DISPLAY: Record<
  PrimitiveId,
  { treeLabel: string; panelTitle: string; codicon: string }
> = {
  kv: { treeLabel: "Key-Value", panelTitle: "Key-Value", codicon: "symbol-key" },
  json: { treeLabel: "Documents", panelTitle: "Documents", codicon: "json" },
  events: { treeLabel: "Events", panelTitle: "Events", codicon: "pulse" },
  vectors: { treeLabel: "Vectors", panelTitle: "Vectors", codicon: "symbol-array" },
  graph: { treeLabel: "Graphs", panelTitle: "Graph", codicon: "type-hierarchy" },
};
