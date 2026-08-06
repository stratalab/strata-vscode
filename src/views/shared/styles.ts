/**
 * The Strata UI layer (U2, design-plan §5): one semantic token set over
 * VS Code's theme variables, one type duet (UI face for chrome, editor mono
 * for data), a 22px data rhythm, and restyled primitives shared by all five
 * views. Every color derives from theme tokens (N8) — `color-mix` tints
 * toward the foreground where a raw chart color would fail contrast.
 *
 * Codicon glyph classes ride along (the font face itself is injected by the
 * page host, which knows the font's URI — see viewHtml.ts / the harness).
 */
import codiconCss from "@vscode/codicons/dist/codicon.css";

/** The @font-face is stripped: its relative url() is meaningless inside the
 * webview; the host injects a correct one. Class rules are kept verbatim. */
const codiconClasses = codiconCss.replace(/@font-face\s*\{[^}]*\}/, "");

export const STYLES = `${codiconClasses}
/* ---- tokens ------------------------------------------------------------ */
:root {
  --st-gap-1: 4px; --st-gap-2: 8px; --st-gap-3: 12px; --st-gap-4: 16px;
  --st-row: 22px;
  --st-radius: 2px;
  --st-radius-surface: 4px;
  --st-live: var(--vscode-charts-green, #89d185);
  --st-past: var(--vscode-charts-orange, #d18616);
  --st-danger: var(--vscode-errorForeground, #f48771);
  --st-ink: var(--vscode-foreground);
  --st-ink-2: var(--vscode-descriptionForeground, var(--vscode-foreground));
  --st-line: var(--vscode-widget-border, #8884);
  --st-line-soft: color-mix(in srgb, var(--vscode-widget-border, #888) 50%, transparent);
  --st-accent: var(--vscode-focusBorder);
  --st-font-ui: var(--vscode-font-family, sans-serif);
  --st-font-data: var(--vscode-editor-font-family, monospace);
  --st-fast: 120ms ease-out;
  color-scheme: light dark;
}

/* ---- page frame -------------------------------------------------------- */
html, body { height: 100%; }
body {
  margin: 0;
  font-family: var(--st-font-ui);
  font-size: var(--vscode-font-size, 13px);
  color: var(--st-ink);
  background: var(--vscode-editor-background);
}
main.strata-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
:focus-visible { outline: 1px solid var(--st-accent); outline-offset: -1px; }
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.codicon { font-size: 14px; }

/* ---- data typography ---------------------------------------------------- */
td, .cell-key, .cell-version, .event-seq, .event-hashes, .timeline-entry,
.timeline-chip, .doc-item, .json-path, .json-value, .json-meta, pre,
.crumb-db, .crumb-value, .banner-pages {
  font-family: var(--st-font-data);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* ---- controls ----------------------------------------------------------- */
button {
  font-family: var(--st-font-ui);
  font-size: 12px;
  height: 24px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, inherit);
  border: 1px solid var(--st-line);
  border-radius: var(--st-radius);
  cursor: pointer;
  transition: background var(--st-fast), border-color var(--st-fast);
}
button:hover { background: var(--vscode-toolbar-hoverBackground); }
input, select {
  font-family: var(--st-font-ui);
  font-size: 12px;
  height: 24px;
  box-sizing: border-box;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--st-line));
  border-radius: var(--st-radius);
  padding: 0 8px;
}

/* ---- scope banner (BN-1) ------------------------------------------------ */
.scope-banner {
  display: flex;
  align-items: center;
  gap: var(--st-gap-3);
  flex-wrap: wrap;
  flex: 0 0 auto;
  min-height: 34px;
  box-sizing: border-box;
  padding: 6px var(--st-gap-3);
  border-bottom: 1px solid var(--st-line);
}
.scope-banner[data-mode="past"] { border-bottom: 2px solid var(--st-past); }
.banner-crumbs {
  margin: 0;
  font-size: inherit;
  font-weight: normal;
  display: flex;
  align-items: baseline;
  gap: var(--st-gap-3);
  min-width: 0;
}
.crumb { display: inline-flex; align-items: baseline; gap: 5px; white-space: nowrap; }
.crumb-db { font-weight: 600; }
.crumb-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
}
.banner-mode { display: inline-flex; align-items: center; gap: 6px; }
.banner-live { color: var(--st-ink-2); font-size: 12px; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--st-live); }
.banner-scrub {
  font-weight: 600;
  font-size: 12px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.banner-scrub .codicon { color: var(--st-past); }
.banner-now { height: 20px; padding: 0 8px; font-size: 11px; }
.banner-pages { margin-left: auto; color: var(--st-ink-2); font-size: 11px; }

/* ---- toolbar + content frame -------------------------------------------- */
.toolbar {
  display: flex;
  gap: var(--st-gap-2);
  align-items: center;
  flex-wrap: wrap;
  flex: 0 0 auto;
  padding: var(--st-gap-2) var(--st-gap-3);
}
.table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 var(--st-gap-3); }
.load-more { margin: var(--st-gap-2) var(--st-gap-3); align-self: flex-start; flex: 0 0 auto; }

/* ---- tables (22px rhythm, eyebrow headers) ------------------------------ */
table { border-collapse: collapse; width: 100%; }
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--vscode-editor-background);
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
  padding: 6px 8px;
  border-bottom: 1px solid var(--st-line);
  cursor: pointer;
  white-space: nowrap;
}
td {
  height: var(--st-row);
  padding: 0 8px;
  border-bottom: 1px solid var(--st-line-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40vw;
}
tr.selected td {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}
tbody tr:hover td { background: var(--vscode-list-hoverBackground); }

/* ---- detail pane -------------------------------------------------------- */
.detail {
  flex: 0 0 auto;
  max-height: 45%;
  overflow: auto;
  border-top: 1px solid var(--st-line);
  padding: var(--st-gap-2) var(--st-gap-3) var(--st-gap-3);
}
.detail-empty, .detail-loading { color: var(--st-ink-2); padding: var(--st-gap-2) var(--st-gap-3); flex: 0 0 auto; }
.detail-head {
  display: flex;
  align-items: center;
  gap: var(--st-gap-2);
  flex-wrap: wrap;
  color: var(--st-ink-2);
  font-size: 12px;
  margin-bottom: var(--st-gap-2);
}
.form-toggle { height: 20px; padding: 0 8px; font-size: 11px; }
.form-toggle.active { border-color: var(--st-accent); color: var(--st-ink); font-weight: 600; }
.form-toggle.disabled { color: var(--st-ink-2); border-color: var(--st-line-soft); cursor: default; background: transparent; }
.form-toggle.disabled:hover { background: var(--vscode-button-secondaryBackground, transparent); }
pre {
  background: var(--vscode-textCodeBlock-background, #8881);
  padding: var(--st-gap-2);
  border-radius: var(--st-radius-surface);
  overflow: auto;
  max-height: 30vh;
}

/* ---- timelines (rail lands in U6; quiet rows meanwhile) ------------------ */
.timeline { margin-top: var(--st-gap-2); display: flex; flex-direction: column; gap: 1px; align-items: stretch; }
.timeline-title { color: var(--st-ink-2); font-size: 11px; margin-bottom: 2px; }
.timeline-entry {
  height: var(--st-row);
  background: transparent;
  border: none;
  border-radius: var(--st-radius);
  padding: 0 var(--st-gap-2);
  justify-content: flex-start;
  text-align: left;
  width: 100%;
}
.timeline-entry:hover { background: var(--vscode-list-hoverBackground); }
.timeline-entry.tombstone { text-decoration: line-through; }
.timeline-chip { color: var(--st-ink-2); margin-right: var(--st-gap-2); }

/* ---- states ------------------------------------------------------------- */
.retention {
  color: color-mix(in srgb, var(--st-past) 55%, var(--st-ink));
  border-left: 2px solid var(--st-past);
  padding: var(--st-gap-2) var(--st-gap-3);
  margin: var(--st-gap-2) var(--st-gap-3);
}
.error {
  color: var(--st-danger);
  border-left: 2px solid var(--st-danger);
  padding: var(--st-gap-2) var(--st-gap-3);
  margin: var(--st-gap-3);
}
.truncation {
  color: color-mix(in srgb, var(--st-past) 55%, var(--st-ink));
  padding: 0 var(--st-gap-3) var(--st-gap-1);
  font-size: 12px;
  flex: 0 0 auto;
}

/* ---- json tree ----------------------------------------------------------- */
.json-node, .json-leaf { padding-left: 14px; line-height: 20px; }
.json-path { cursor: pointer; color: var(--vscode-symbolIcon-propertyForeground, inherit); margin-right: 6px; }
.json-path:hover { text-decoration: underline; }
.json-meta { color: var(--st-ink-2); }
.json-string { color: color-mix(in srgb, var(--vscode-charts-green, #388a34) 75%, var(--st-ink)); }
.json-number { color: color-mix(in srgb, var(--vscode-charts-blue, #2b7cd3) 80%, var(--st-ink)); }
.diff-added > summary, .json-leaf.diff-added { background: color-mix(in srgb, var(--vscode-charts-green, #388a34) 18%, transparent); }
.diff-removed > summary, .json-leaf.diff-removed { background: color-mix(in srgb, var(--vscode-errorForeground, #f00) 18%, transparent); }
.diff-changed > summary, .json-leaf.diff-changed { background: color-mix(in srgb, var(--vscode-charts-orange, #d18616) 14%, transparent); }
.diff-note { margin: 0 var(--st-gap-3) var(--st-gap-1); flex: 0 0 auto; }
.diff-added { color: color-mix(in srgb, var(--vscode-charts-green, #388a34) 75%, var(--st-ink)); }
.diff-removed { color: var(--st-danger); }
.diff-changed { color: color-mix(in srgb, var(--st-past) 55%, var(--st-ink)); }

/* ---- json browser split -------------------------------------------------- */
.split {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 3fr;
  gap: var(--st-gap-3);
  padding: 0 var(--st-gap-3) var(--st-gap-3);
}
.doc-list {
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: stretch;
  border-right: 1px solid var(--st-line-soft);
  padding-right: var(--st-gap-2);
}
.doc-item {
  height: var(--st-row);
  background: transparent;
  border: none;
  border-radius: var(--st-radius);
  padding: 0 var(--st-gap-2);
  justify-content: flex-start;
  text-align: left;
}
.doc-item:hover { background: var(--vscode-list-hoverBackground); }
.doc-item.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
  font-weight: normal;
}
.doc-detail { overflow: auto; min-height: 0; }
details.indexes { padding: 0 var(--st-gap-3) var(--st-gap-3); flex: 0 0 auto; }
details.indexes summary { cursor: pointer; color: var(--st-ink-2); }

/* ---- event feed ----------------------------------------------------------- */
.feed {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 0 var(--st-gap-3) var(--st-gap-2);
}
.event-entry { border-bottom: 1px solid var(--st-line-soft); flex: 0 0 auto; }
.event-head {
  min-height: var(--st-row);
  display: flex;
  gap: var(--st-gap-3);
  align-items: center;
  cursor: pointer;
  padding: 0 var(--st-gap-1);
}
.event-head:hover { background: var(--vscode-list-hoverBackground); }
.event-seq { color: var(--st-ink-2); min-width: 56px; text-align: right; }
.event-type { font-weight: 600; font-size: 12px; }
.event-time { color: var(--st-ink-2); font-size: 11px; margin-left: auto; }
.event-hashes { color: var(--st-ink-2); font-size: 11px; padding: 2px 0 6px 68px; }
.chain-ok { color: color-mix(in srgb, var(--st-live) 75%, var(--st-ink)); }
.chain-bad { color: var(--st-danger); font-weight: 600; }

/* ---- vector browser -------------------------------------------------------- */
.cards { display: flex; gap: var(--st-gap-2); flex-wrap: wrap; flex: 0 0 auto; padding: var(--st-gap-2) var(--st-gap-3); }
.card {
  height: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--st-gap-2) var(--st-gap-3);
  border: 1px solid var(--st-line);
  border-radius: var(--st-radius-surface);
  background: transparent;
}
.card:hover { background: var(--vscode-list-hoverBackground); }
.card.selected { border-color: var(--st-accent); }
.card-title { font-weight: 600; }
.card-meta { color: var(--st-ink-2); font-size: 11px; }

/* ---- graph canvas ------------------------------------------------------------ */
.graph-split {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 3fr minmax(220px, 1fr);
  gap: var(--st-gap-3);
  padding: 0 var(--st-gap-3) var(--st-gap-3);
}
.canvas-scroll {
  overflow: auto;
  min-height: 0;
  border: 1px solid var(--st-line);
  border-radius: var(--st-radius-surface);
}
.graph-canvas { width: 100%; height: 100%; min-height: 0; display: block; }
.graph-edge { stroke: var(--vscode-charts-lines, #8888); stroke-width: 1; }
.graph-node { cursor: pointer; }
.graph-label { fill: var(--st-ink); font-size: 11px; }
.sidebar { overflow: auto; min-height: 0; }
.sidebar-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
  margin: var(--st-gap-2) 0 var(--st-gap-1);
}
.sidebar-sub {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
  margin-top: var(--st-gap-2);
}
.type-chip {
  height: var(--st-row);
  background: transparent;
  border: none;
  border-radius: var(--st-radius);
  padding: 0 var(--st-gap-1);
  justify-content: flex-start;
  text-align: left;
  width: 100%;
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 0;
}
.type-chip:hover { background: var(--vscode-list-hoverBackground); }
.type-chip.hidden-type { color: var(--st-ink-2); }
.type-chip.hidden-type .swatch { opacity: 0.35; }
.swatch { width: 10px; height: 10px; border-radius: 5px; display: inline-block; flex: 0 0 auto; }
.link-type { font-size: 12px; color: var(--st-ink); line-height: 20px; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
