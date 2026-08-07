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
  --st-surface: var(--vscode-editor-background);
  color-scheme: light dark;
}

/* SIG-2: the past is amber, ambiently. Scrubbed views shift the whole
 * surface ≤5% toward the theme's own amber — mode error insurance the eye
 * gets before the banner is read. High-contrast themes speak with borders
 * instead (the tint would muddy their guarantee). */
body[data-time="past"] {
  --st-surface: color-mix(in srgb, var(--st-past) 5%, var(--vscode-editor-background));
  --st-ink-2: color-mix(in srgb, var(--vscode-descriptionForeground, var(--vscode-foreground)) 80%, var(--st-ink));
}
body.vscode-high-contrast[data-time="past"] { --st-surface: var(--vscode-editor-background); }
body.vscode-high-contrast[data-time="past"] .scope-banner { border-bottom-width: 3px; }

/* ---- page frame -------------------------------------------------------- */
html, body { height: 100%; }
body {
  margin: 0;
  font-family: var(--st-font-ui);
  font-size: var(--vscode-font-size, 13px);
  color: var(--st-ink);
  background: var(--st-surface);
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
td, .cell-key, .cell-version, .event-seq, .event-hashes, .rail-entry,
.doc-item, .json-path, .json-value, .json-meta, pre,
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
  background: var(--st-surface);
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
  padding: 6px 8px;
  border-bottom: 1px solid var(--st-line);
  cursor: default;
  white-space: nowrap;
}
th.sortable { cursor: pointer; }
.sort-glyph { font-size: 11px; opacity: 0; margin-left: 2px; vertical-align: -1px; }
.sort-glyph.on { opacity: 1; }
th.sortable:hover .sort-glyph:not(.on) { opacity: 0.5; }
.toolbar-note { color: var(--st-ink-2); font-size: 11px; }
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

/* ---- detail pane (right rail on wide panels, KV-5) ----------------------- */
.kv-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.kv-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.detail {
  flex: 0 0 auto;
  max-height: 45%;
  overflow: auto;
  border-top: 1px solid var(--st-line);
  padding: var(--st-gap-2) var(--st-gap-3) var(--st-gap-3);
}
@media (min-width: 720px) {
  .kv-body { flex-direction: row; }
  .kv-main { flex: 1 1 58%; min-width: 0; }
  .kv-body > .detail { flex: 1 1 42%; min-width: 0; max-height: none; border-top: none; border-left: 1px solid var(--st-line); }
}
.detail-key { font-family: var(--st-font-data); font-size: 12px; font-weight: 600; color: var(--st-ink); cursor: pointer; }
.detail-key:hover { text-decoration: underline dotted; }
.chip {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 16px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--st-font-data);
  color: var(--st-ink);
  background: color-mix(in srgb, var(--st-ink) 10%, transparent);
}
.chip-added { background: color-mix(in srgb, var(--vscode-charts-green, #388a34) 18%, transparent); color: color-mix(in srgb, var(--vscode-charts-green, #388a34) 45%, var(--st-ink)); }
.chip-removed { background: color-mix(in srgb, var(--vscode-errorForeground, #f00) 15%, transparent); color: color-mix(in srgb, var(--st-danger) 55%, var(--st-ink)); }
.chip-changed { background: color-mix(in srgb, var(--vscode-charts-orange, #d18616) 15%, transparent); color: color-mix(in srgb, var(--st-past) 40%, var(--st-ink)); }
.segmented { display: inline-flex; margin-left: auto; }
.segmented .seg { border-radius: 0; margin-left: -1px; height: 20px; padding: 0 8px; font-size: 11px; }
.segmented .seg:first-child { border-radius: var(--st-radius) 0 0 var(--st-radius); margin-left: 0; }
.segmented .seg:last-child { border-radius: 0 var(--st-radius) var(--st-radius) 0; }
.segmented .seg.active { border-color: var(--st-accent); color: var(--st-ink); font-weight: 600; position: relative; z-index: 1; }
.segmented .seg.disabled { color: var(--st-ink-2); border-color: var(--st-line-soft); cursor: default; background: transparent; }
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

/* ---- the strata rail (SIG-1) --------------------------------------------- */
.rail { margin-top: var(--st-gap-2); display: flex; flex-direction: column; gap: 1px; align-items: stretch; }
.rail-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
  margin-bottom: 2px;
}
.rail-entry {
  height: var(--st-row);
  display: flex;
  align-items: center;
  gap: var(--st-gap-2);
  background: transparent;
  border: none;
  border-radius: var(--st-radius);
  padding: 0 var(--st-gap-2);
  width: 100%;
  text-align: left;
}
.rail-entry:hover { background: var(--vscode-list-hoverBackground); }
.rail-entry:hover .rail-time, .rail-entry:hover .rail-preview, .rail-entry:hover .rail-verb { color: var(--st-ink); }
.rail-entry:hover .rail-verb, .rail-entry:focus-visible .rail-verb { opacity: 1; }
.rail-core {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  border-radius: 2px;
  background: repeating-linear-gradient(
    180deg,
    color-mix(in srgb, var(--st-ink) 38%, transparent) 0 3px,
    color-mix(in srgb, var(--st-ink) 14%, transparent) 3px 6px
  );
}
.rail-entry[data-newest="true"] .rail-core {
  box-shadow: inset 0 2px 0 0 color-mix(in srgb, var(--st-live) 80%, var(--st-ink));
}
.rail-entry.tombstone .rail-core {
  background: repeating-linear-gradient(
    45deg,
    transparent 0 2px,
    color-mix(in srgb, var(--st-ink) 30%, transparent) 2px 4px
  );
}
.rail-entry.tombstone .rail-version, .rail-entry.tombstone .rail-preview { text-decoration: line-through; }
.rail-entry.active { background: color-mix(in srgb, var(--st-past) 10%, transparent); }
.rail-entry.active .rail-time, .rail-entry.active .rail-preview { color: var(--st-ink); }
.rail-entry.active .rail-core { outline: 2px solid var(--st-past); outline-offset: 1px; }
.rail-version { min-width: 34px; font-weight: 600; flex: 0 0 auto; }
.rail-time { color: var(--st-ink-2); flex: 0 0 auto; }
.rail-preview { color: var(--st-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }
.rail-verb {
  margin-left: auto;
  opacity: 0;
  font-family: var(--st-font-ui);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: color-mix(in srgb, var(--st-past) 40%, var(--st-ink));
  transition: opacity var(--st-fast);
  flex: 0 0 auto;
}
.rail-entry.active .rail-verb { opacity: 1; }

/* SIG-3: the deposit pulse — history visibly accumulating on each tick. */
.deposit-pulse {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 10;
  pointer-events: none;
  transform-origin: left;
  background: linear-gradient(90deg, color-mix(in srgb, var(--st-live) 80%, transparent), transparent 70%);
  animation: st-deposit 500ms ease-out forwards;
}
@keyframes st-deposit {
  from { transform: scaleX(0); opacity: 1; }
  to { transform: scaleX(1); opacity: 0; }
}

/* ---- states ------------------------------------------------------------- */
.retention {
  color: color-mix(in srgb, var(--st-past) 55%, var(--st-ink));
  border-left: 2px solid var(--st-past);
  padding: var(--st-gap-2) var(--st-gap-3);
  margin: var(--st-gap-2) var(--st-gap-3);
}
/* skeleton first paint (XC-6) */
.skeleton { padding: var(--st-gap-2) 0; }
.skeleton-row { height: var(--st-row); display: flex; gap: var(--st-gap-3); align-items: center; padding: 0 var(--st-gap-3); }
.skeleton-block { height: 10px; border-radius: 2px; background: color-mix(in srgb, var(--st-ink) 10%, transparent); animation: st-shimmer 1.2s ease-in-out infinite; }
@keyframes st-shimmer { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

/* empty states (XC-7) */
.empty-state { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--st-gap-2); text-align: center; padding: var(--st-gap-4); color: var(--st-ink-2); }
.empty-state .codicon { font-size: 28px; opacity: 0.8; }
.empty-title { font-weight: 600; font-size: 13px; color: var(--st-ink); }
.empty-body { font-size: 12px; max-width: 380px; line-height: 1.5; }
.filter-empty { padding: var(--st-gap-2) var(--st-gap-3); color: var(--st-ink-2); display: flex; gap: var(--st-gap-2); align-items: center; flex: 0 0 auto; }

/* failure cards (XC-8) */
.error-card { margin: var(--st-gap-4) auto; width: min(460px, calc(100% - 2 * var(--st-gap-4))); border: 1px solid var(--st-line); border-left: 3px solid var(--st-danger); border-radius: var(--st-radius-surface); padding: var(--st-gap-3); display: flex; flex-direction: column; gap: var(--st-gap-2); box-sizing: border-box; }
.error-card.retention-card { border-left-color: var(--st-past); }
.error-title { font-weight: 600; display: flex; gap: 6px; align-items: center; }
.error-title .codicon { color: var(--st-danger); }
.retention-card .error-title .codicon { color: color-mix(in srgb, var(--st-past) 55%, var(--st-ink)); }
.error-message { color: var(--st-ink-2); font-size: 12px; overflow-wrap: anywhere; }
.error-actions { display: flex; gap: var(--st-gap-2); align-items: center; }
.error-code { margin-left: auto; font-family: var(--st-font-data); font-size: 11px; color: var(--st-ink-2); }
button.error-code-link { background: none; border: none; height: auto; padding: 0; cursor: pointer; color: var(--vscode-textLink-foreground, inherit); }
button.error-code-link:hover { background: none; text-decoration: underline; }

/* copy feedback (XC-9) */
.copied-badge { margin-left: 6px; font-size: 10px; font-weight: 600; color: color-mix(in srgb, var(--st-live) 70%, var(--st-ink)); }
.truncation {
  display: flex;
  align-items: center;
  gap: 6px;
  color: color-mix(in srgb, var(--st-past) 55%, var(--st-ink));
  padding: 0 var(--st-gap-3) var(--st-gap-1);
  font-size: 12px;
  flex: 0 0 auto;
}
.truncation .codicon { font-size: 13px; }
.truncation-dismiss {
  height: 18px;
  width: 18px;
  padding: 0;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--st-ink-2);
  font-size: 13px;
}

/* ---- json tree ----------------------------------------------------------- */
.json-node, .json-leaf { padding-left: 14px; line-height: 20px; }
.json-path { cursor: pointer; color: color-mix(in srgb, var(--vscode-symbolIcon-propertyForeground, var(--st-ink)) 75%, var(--st-ink)); margin-right: 6px; }
.json-path:hover { text-decoration: underline; }
.json-meta { color: var(--st-ink-2); }
.json-string { color: color-mix(in srgb, var(--vscode-charts-green, #388a34) 75%, var(--st-ink)); }
.json-number { color: color-mix(in srgb, var(--vscode-charts-blue, #2b7cd3) 80%, var(--st-ink)); }
.diff-added > summary, .json-leaf.diff-added { background: color-mix(in srgb, var(--vscode-charts-green, #388a34) 18%, transparent); }
.diff-removed > summary, .json-leaf.diff-removed { background: color-mix(in srgb, var(--vscode-errorForeground, #f00) 18%, transparent); }
.diff-changed > summary, .json-leaf.diff-changed { background: color-mix(in srgb, var(--vscode-charts-orange, #d18616) 14%, transparent); }
.diff-note { display: flex; align-items: center; gap: var(--st-gap-1); margin: 0 0 var(--st-gap-1); flex: 0 0 auto; }
.json-leaf.diff-added .json-path, .json-leaf.diff-added .json-value,
.json-leaf.diff-removed .json-path, .json-leaf.diff-removed .json-value,
.json-leaf.diff-changed .json-path, .json-leaf.diff-changed .json-value,
.diff-added > summary .json-path, .diff-added > summary .json-meta,
.diff-removed > summary .json-path, .diff-removed > summary .json-meta,
.diff-changed > summary .json-path, .diff-changed > summary .json-meta { color: var(--st-ink); }

/* ---- json browser split -------------------------------------------------- */
.doc-pane { display: flex; flex-direction: column; gap: var(--st-gap-1); min-height: 0; border-right: 1px solid var(--st-line-soft); padding-right: var(--st-gap-2); }
.list-head {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--st-ink-2);
}
.doc-head { display: flex; align-items: center; gap: var(--st-gap-2); margin-bottom: var(--st-gap-1); }
.doc-id { font-family: var(--st-font-data); font-size: 12px; font-weight: 600; cursor: pointer; }
.doc-id:hover { text-decoration: underline dotted; }
.doc-tools { margin-left: auto; display: inline-flex; gap: var(--st-gap-1); }
.tree-tool { height: 20px; padding: 0 8px; font-size: 10px; }
.show-all { height: 16px; padding: 0 6px; font-size: 10px; margin-left: 6px; }
.diff-exit { height: 20px; padding: 0 8px; font-size: 11px; margin-left: var(--st-gap-2); }
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
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: stretch;
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
.feed-wrap { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.feed {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 0 var(--st-gap-3) var(--st-gap-2);
}
.new-pill {
  position: absolute;
  bottom: var(--st-gap-3);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  height: 24px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--st-ink);
  background: color-mix(in srgb, var(--st-live) 18%, var(--st-surface));
  border: 1px solid color-mix(in srgb, var(--st-live) 50%, var(--st-line));
}
.new-pill:hover { background: color-mix(in srgb, var(--st-live) 28%, var(--st-surface)); }
.event-body {
  margin-left: 68px;
  border-left: 2px solid var(--st-line-soft);
  padding: 2px 0 4px var(--st-gap-2);
}
.event-entry.arrived { animation: st-arrive 600ms ease-out; }
@keyframes st-arrive {
  from { background: color-mix(in srgb, var(--st-live) 12%, transparent); }
  to { background: transparent; }
}
.event-entry.attention { animation: st-attention 1.2s ease-out; }
@keyframes st-attention {
  0%, 60% { background: color-mix(in srgb, var(--st-danger) 14%, transparent); }
  100% { background: transparent; }
}
.chain-ok-chip {
  color: color-mix(in srgb, var(--st-live) 45%, var(--st-ink));
  background: color-mix(in srgb, var(--st-live) 14%, transparent);
  height: 20px;
  border-radius: 10px;
  border: none;
}
.chain-bad-chip {
  color: color-mix(in srgb, var(--st-danger) 55%, var(--st-ink));
  background: color-mix(in srgb, var(--st-danger) 14%, transparent);
  height: 20px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
}
.chain-ok-chip .codicon, .chain-bad-chip .codicon { font-size: 12px; }
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
.event-head:hover .event-seq, .event-head:hover .event-time { color: var(--st-ink); }
.event-seq { color: var(--st-ink-2); min-width: 56px; text-align: right; }
.event-type { font-weight: 600; font-size: 12px; }
.event-time { color: var(--st-ink-2); font-size: 11px; margin-left: auto; }
.event-hashes { color: var(--st-ink-2); font-size: 11px; padding: 2px 0 0; }

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
.card:hover .card-meta { color: var(--st-ink); }
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
  overflow: hidden;
  min-height: 0;
  border: 1px solid var(--st-line);
  border-radius: var(--st-radius-surface);
}
.graph-canvas { width: 100%; height: 100%; min-height: 0; display: block; cursor: grab; touch-action: none; }
.graph-canvas.panning { cursor: grabbing; }
.graph-edge { stroke: var(--vscode-charts-lines, #8888); stroke-width: 1; opacity: 0.75; transition: opacity var(--st-fast); }
.graph-edge.lit { opacity: 1; stroke-width: 1.6; }
.graph-edge.dim { opacity: 0.18; }
.graph-arrow { fill: var(--vscode-charts-lines, #8888); opacity: 0.8; }
.graph-node { cursor: pointer; transition: opacity var(--st-fast); }
.graph-node.dim { opacity: 0.3; }
.graph-node.picked circle:first-child { stroke: var(--st-accent); stroke-width: 2.5; }
.expand-ring { fill: none; stroke: var(--st-ink-2); stroke-width: 1; stroke-dasharray: 2 3; opacity: 0.7; }
.graph-node.picked .expand-ring { stroke: var(--st-accent); }
/* GR-3: the halo — labels stay legible over edges and nodes. */
.graph-label {
  fill: var(--st-ink);
  font-size: 11px;
  paint-order: stroke;
  stroke: var(--st-surface);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.zoom-readout { color: var(--st-ink-2); font-size: 11px; font-family: var(--st-font-data); min-width: 40px; }
.legend-row { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 20px; color: var(--st-ink); }
.legend-note { color: var(--st-ink-2); font-size: 11px; margin: 2px 0; }
.legend-dot { border-radius: 50%; background: var(--st-ink-2); display: inline-block; flex: 0 0 auto; }
.legend-dot-min { width: 7px; height: 7px; }
.legend-dot-max { width: 16px; height: 16px; }
.selection-id { font-family: var(--st-font-data); font-size: 12px; font-weight: 600; margin-bottom: 2px; }
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
