/**
 * The one mapping from primitive wire ids to display language (U5, TR-1) —
 * tree labels, panel titles, and codicons all read from here so the icon
 * and naming language never drifts between surfaces. Wire ids stay in
 * tooltips for precision; they are never labels (§7).
 */

export type PrimitiveId = "kv" | "json" | "events" | "vectors" | "graph";
export type ViewDisplayId = "space" | PrimitiveId;

export const VIEW_DISPLAY: Record<
  ViewDisplayId,
  { treeLabel: string; panelTitle: string; codicon: string }
> = {
  space: { treeLabel: "Space", panelTitle: "Space", codicon: "symbol-namespace" },
  kv: { treeLabel: "Key-Value", panelTitle: "Key-Value", codicon: "symbol-key" },
  json: { treeLabel: "Documents", panelTitle: "Documents", codicon: "json" },
  events: { treeLabel: "Events", panelTitle: "Events", codicon: "pulse" },
  vectors: { treeLabel: "Vectors", panelTitle: "Vectors", codicon: "symbol-array" },
  graph: { treeLabel: "Graphs", panelTitle: "Graph", codicon: "type-hierarchy" },
};

export const PRIMITIVE_DISPLAY: Record<
  PrimitiveId,
  { treeLabel: string; panelTitle: string; codicon: string }
> = {
  kv: VIEW_DISPLAY.kv,
  json: VIEW_DISPLAY.json,
  events: VIEW_DISPLAY.events,
  vectors: VIEW_DISPLAY.vectors,
  graph: VIEW_DISPLAY.graph,
};
