/**
 * Webview entry (E8): routes the init message to the right view. One bundle
 * serves all five views; styles use the editor's theme tokens throughout
 * (N8) and honor reduced motion (N10 — no animations are defined at all).
 */
import { ViewRpc } from "./shared/rpc";
import { KvTableView } from "./kvTable";
import { JsonBrowserView } from "./jsonBrowser";
import { EventFeedView } from "./eventFeed";
import { VectorBrowserView } from "./vectorBrowser";
import { GraphCanvasView } from "./graphCanvas";

const STYLES = `
:root { color-scheme: light dark; }
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); font-size: var(--vscode-font-size); margin: 0; padding: 8px; }
button { background: var(--vscode-button-secondaryBackground, transparent); color: var(--vscode-button-secondaryForeground, inherit); border: 1px solid var(--vscode-widget-border, #8884); border-radius: 3px; padding: 2px 8px; cursor: pointer; }
button:hover { background: var(--vscode-toolbar-hoverBackground); }
button:focus-visible, [tabindex]:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
input, select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #8884); border-radius: 3px; padding: 2px 6px; }
.scope-banner { padding: 4px 6px; margin-bottom: 6px; border-bottom: 1px solid var(--vscode-widget-border, #8884); color: var(--vscode-descriptionForeground); }
.banner-scrub { color: var(--vscode-charts-orange, #d18616); font-weight: 600; }
.banner-now { margin-left: 8px; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.table-scroll { overflow: auto; max-height: 45vh; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; position: sticky; top: 0; background: var(--vscode-editor-background); cursor: pointer; padding: 3px 8px; border-bottom: 1px solid var(--vscode-widget-border, #8884); }
td { padding: 2px 8px; border-bottom: 1px solid var(--vscode-widget-border, #4442); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
tbody tr:hover td { background: var(--vscode-list-hoverBackground); }
.load-more { margin: 6px 0; }
.detail { margin-top: 8px; border-top: 1px solid var(--vscode-widget-border, #8884); padding-top: 6px; }
.detail-empty, .detail-loading { color: var(--vscode-descriptionForeground); margin-top: 8px; }
.detail-head { margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
.form-toggle.active { border-color: var(--vscode-focusBorder); font-weight: 600; }
.form-toggle.disabled { opacity: 0.4; cursor: default; }
pre { background: var(--vscode-textCodeBlock-background, #8881); padding: 6px; overflow: auto; max-height: 30vh; }
.retention { color: var(--vscode-charts-orange, #d18616); padding: 8px; }
.error { color: var(--vscode-errorForeground); padding: 8px; }
.timeline { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.timeline-title { color: var(--vscode-descriptionForeground); }
.timeline-entry.tombstone { text-decoration: line-through; }
.timeline-chip { margin-right: 8px; color: var(--vscode-descriptionForeground); }
.json-node, .json-leaf { padding-left: 14px; }
.json-path { cursor: pointer; color: var(--vscode-symbolIcon-propertyForeground, inherit); margin-right: 6px; }
.json-path:hover { text-decoration: underline; }
.json-meta { color: var(--vscode-descriptionForeground); }
.json-string { color: var(--vscode-charts-green, #388a34); }
.json-number { color: var(--vscode-charts-blue, #2b7cd3); }
.diff-added > summary, .json-leaf.diff-added { background: color-mix(in srgb, var(--vscode-charts-green, #388a34) 18%, transparent); }
.diff-removed > summary, .json-leaf.diff-removed { background: color-mix(in srgb, var(--vscode-errorForeground, #f00) 18%, transparent); }
.diff-changed > summary, .json-leaf.diff-changed { background: color-mix(in srgb, var(--vscode-charts-orange, #d18616) 14%, transparent); }
.diff-note { margin-bottom: 6px; }
.diff-added { color: var(--vscode-charts-green, #388a34); }
.diff-removed { color: var(--vscode-errorForeground); }
.diff-changed { color: var(--vscode-charts-orange, #d18616); }
.split { display: grid; grid-template-columns: minmax(160px, 1fr) 3fr; gap: 10px; }
.doc-list { display: flex; flex-direction: column; gap: 2px; max-height: 70vh; overflow: auto; align-items: stretch; }
.doc-item.selected { border-color: var(--vscode-focusBorder); font-weight: 600; }
.feed { overflow: auto; max-height: 75vh; display: flex; flex-direction: column; }
.event-entry { border-bottom: 1px solid var(--vscode-widget-border, #4442); padding: 3px 0; }
.event-head { cursor: pointer; display: flex; gap: 10px; }
.event-seq { color: var(--vscode-descriptionForeground); min-width: 48px; }
.event-type { font-weight: 600; }
.event-time { color: var(--vscode-descriptionForeground); }
.event-hashes { color: var(--vscode-descriptionForeground); font-size: 90%; padding: 2px 0 2px 48px; }
.chain-ok { color: var(--vscode-charts-green, #388a34); }
.chain-bad { color: var(--vscode-errorForeground); font-weight: 600; }
.cards { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.card { display: flex; flex-direction: column; align-items: flex-start; padding: 6px 10px; }
.card.selected { border-color: var(--vscode-focusBorder); }
.card-title { font-weight: 600; }
.card-meta { color: var(--vscode-descriptionForeground); font-size: 90%; }
.graph-split { display: grid; grid-template-columns: 3fr minmax(220px, 1fr); gap: 10px; }
.canvas-scroll { overflow: auto; border: 1px solid var(--vscode-widget-border, #8884); }
.graph-canvas { width: 100%; min-height: 60vh; }
.graph-edge { stroke: var(--vscode-charts-lines, #8888); stroke-width: 1; }
.graph-node { cursor: pointer; }
.graph-label { fill: var(--vscode-foreground); font-size: 11px; }
.sidebar { overflow: auto; max-height: 75vh; }
.sidebar-title { font-weight: 600; margin: 6px 0 4px; }
.sidebar-sub { color: var(--vscode-descriptionForeground); margin-top: 6px; }
.type-chip { display: flex; gap: 6px; align-items: center; margin: 2px 0; }
.type-chip.hidden-type { opacity: 0.45; }
.swatch { width: 10px; height: 10px; border-radius: 5px; display: inline-block; }
.truncation { color: var(--vscode-charts-orange, #d18616); margin-bottom: 4px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function main(): void {
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  const root = document.createElement("div");
  document.body.append(root);

  const rpc: ViewRpc = new ViewRpc((view) => {
    let instance: { reload(): Promise<void> };
    switch (view) {
      case "kv":
        instance = new KvTableView(root, rpc);
        break;
      case "json":
        instance = new JsonBrowserView(root, rpc);
        break;
      case "events":
        instance = new EventFeedView(root, rpc);
        break;
      case "vectors":
        instance = new VectorBrowserView(root, rpc);
        break;
      case "graph":
        instance = new GraphCanvasView(root, rpc);
        break;
      default:
        root.textContent = `unknown view: ${view}`;
        return;
    }
    void instance.reload();
  });
}

main();
