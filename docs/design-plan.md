# StrataDB for VS Code — UX review & design plan

**Status:** proposed · **Scope:** every user-facing surface of the V1 observer
extension · **Bar:** the craft level of Linear and Stripe, translated honestly
into a VS Code extension · **Companion docs:** [requirements.md](requirements.md),
[implementation-plan.md](implementation-plan.md)

This document does two things: it reviews each shipped surface against that
bar (findings carry IDs like `KV-3`), and it turns the findings into an
implementation plan (epics `U1–U12`, milestones `D1–D3`) with the same
traceability discipline as the V1 plan.

---

## 1. Method and the bar

The review covers the code as merged at 0.1.0: the explorer tree, status bar,
the five primitive webviews, the shared scope banner, the console quick-input
flows, the time-travel and branch flows, inspector documents, first-run
surfaces (welcome view, walkthrough), and the extension manifest.

"Linear/Stripe caliber" means something specific here, and it is mostly not
gradients:

- **Platform fidelity so deep the product feels built-in.** Linear feels
  inevitable on macOS because it obeys the platform harder than the platform
  does. For us: outside the webviews, the extension must be indistinguishable
  from VS Code itself — correct icon language, correct quick-input anatomy,
  correct copy register, correct use of badges, tooltips, and welcome views.
- **One opinionated signature, everywhere.** Stripe's docs are recognizable
  from a single screenshot. We get one signature (§3) and repeat it until it
  is the product's handwriting.
- **States are designed, not defaulted.** Loading, empty, error, and truncated
  are first-class screens with a next action — never `loading…` in gray.
- **Numbers and time are typeset.** Tabular numerals, humanized timestamps,
  thousands separators. A database tool that prints
  `2026-08-05T14:32:07.123456Z` in a table cell is not done.

## 2. What is already right (keep, do not redesign)

The V1 build made several genuinely good calls that this plan builds on
rather than replaces:

- The **closed set of teaching states** for attachment (F1.5) — unowned,
  at-capacity, version-mismatch, pre-V1 — is exactly the "errors teach"
  posture we want; D1 only rewrites their copy and actions.
- The **scope banner on every view** (F4.6) and the "no silent truncation"
  page facts. The banner is the right organ in the wrong clothes.
- **Greyed-but-visible writes** in the console with a stated reason (AR-4.2).
- **Native diff editor** for cross-branch comparison — never rebuild diff UI.
- Codicons in the tree, `aria-label`s and keyboard handlers in the views, the
  global reduced-motion kill switch (N10). The a11y skeleton exists.
- The strict-CSP, theme-token-only webview posture (N8). Every proposal below
  stays inside it.

## 3. Design thesis and the signature

**The subject:** a live, append-only, versioned database — usually the memory
of a running agent. The product's name is geological. Its icon is already
three sediment bands. Its single differentiating power is *time*: history,
`as_of`, branches, ticks.

**The thesis:** make time the visual language of the extension. Everything
else stays quiet, native, and disciplined; the one place we spend boldness is
how the interface renders *past, present, and the arrival of the new*.

The signature is one system with three expressions:

- **SIG-1 · The strata rail.** Every history timeline (KV key, JSON doc,
  vector entry) renders as the same component: a compact sediment column,
  newest layer on top, one 22px row per version with a layered-band glyph in
  a fixed left cell — the "core sample." Tombstones are hatched and struck
  through. The current scrub position carries an amber marker. The rail's
  verb is explicit per view ("Scrub here" / "Compare with current") and the
  whole rail is a keyboard-navigable listbox. Today each view hand-rolls a
  stack of default `<button>`s ([kvTable.ts](../src/views/kvTable.ts),
  [jsonBrowser.ts](../src/views/jsonBrowser.ts)) and the vector view renders
  inert `<span>` chips — three different timelines, none designed.
- **SIG-2 · The past is amber, ambiently.** When a database is scrubbed, the
  entire webview shifts — background washed with
  `color-mix(in srgb, var(--vscode-charts-orange) 5%, var(--vscode-editor-background))`,
  a 3px amber band on the banner — so "you are looking at history" is
  preattentive, not a sentence you must read. Mode error (misreading
  historical data as live) is the scrubber's one dangerous failure, and a
  one-line banner with an ⏪ emoji is not enough insurance. High-contrast
  themes get a solid border treatment instead of the wash (`body.vscode-high-contrast`).
- **SIG-3 · The deposit pulse.** When a live tick lands at head, a 2px line
  sweeps under the banner and settles — history visibly accumulating — and
  the newest event-feed entry gets a brief background fade. Under
  `prefers-reduced-motion`, both reduce to an incrementing version number in
  the banner. This is the "watch your agent think" moment given a body.

**The declared aesthetic risk** is SIG-2: tinting an entire surface by mode
is something almost no tool does (most settle for a banner). It is justified
because the mode is genuinely dangerous to misread, it is bounded (≤5% mix,
theme-derived hue, HC fallback), and it disappears entirely in the default
state. If visual QA shows it muddying any stock theme, the fallback is
banner-plus-border only — the decision gate is a D2 acceptance criterion.

**The self-critique pass** (what a generic answer would have been, and what
changed): a template proposal for "polish this data tool" reaches for card
shadows, a brand accent color, hero empty-state illustrations, and springy
animations. All of that is struck. There is no brand accent — the accents are
VS Code's own chart tokens so every theme keeps its own temperature. There
are no shadows or elevation — VS Code's flat surface language wins. Motion is
limited to the two signature moments plus 120ms micro-transitions. The one
memorable thing is the time language, because that is the one thing only
Strata can say.

## 4. Structural constraints (design inside these, never around)

| Constraint | Consequence |
|---|---|
| Strict CSP, zero network (N8/N4) | No web fonts, no CDN icons, no remote images. Typography personality must come from the editor's own stacks. The CSP already allows `font-src ${cspSource}` ([viewHtml.ts](../src/ui/viewHtml.ts)) — so we **bundle `@vscode/codicons`** into `dist/` and get real iconography in webviews. |
| Theme tokens only (N8) | Every color derives from `--vscode-*` vars (via `color-mix` where we need tints). The design must survive Dark Modern, Light Modern, both HC themes, and arbitrary community themes. |
| Native surfaces are not restylable | Tree, quick inputs, status bar, notifications: our craft budget there is information architecture, iconography, copy, and choosing the *right* native affordance (multi-step QuickInput, view badges, MarkdownString tooltips). |
| Read-only V1 (AR-4) | No design may imply an edit affordance. Selection, copy, and navigation only. |
| N10 accessibility floor | Color is never the only signal; keyboard reaches everything; reduced motion honored. The signature system itself must degrade (SIG-3's counter fallback). |

## 5. The Strata UI token layer (webviews)

A semantic layer over VS Code's vars, defined once in the shared stylesheet
and used by every view. No raw hex anywhere except documented HC fallbacks.

**Color roles**

| Token | Derivation | Used for |
|---|---|---|
| `--st-live` | `--vscode-charts-green` | deposit pulse, chain-intact, live dot |
| `--st-past` | `--vscode-charts-orange` | wash, scrub markers, retention notices |
| `--st-danger` | `--vscode-errorForeground` | chain broken, error cards, removed diff |
| `--st-added` / `--st-changed` | charts green / orange mixes | structural diff |
| `--st-ink-2` | `--vscode-descriptionForeground` | captions, meta |
| `--st-line` | `--vscode-widget-border` @ full / 50% | hairlines: chrome vs. rows |
| `--st-hue-1…6` | the six `--vscode-charts-*` hues | graph node types, categorical color |

**Type roles** — three, total. `ui`: `--vscode-font-family` at
`--vscode-font-size` (13px). `data`: `--vscode-editor-font-family` with
`font-variant-numeric: tabular-nums` — every key, id, hash, number, and
timestamp. `eyebrow`: 11px, weight 600, uppercase, 0.08em tracking,
`--st-ink-2` — section labels ("ONTOLOGY", "HISTORY"). The display
personality of these views comes from the ui/mono duet and disciplined
casing, not from a typeface we are not allowed to ship.

**Rhythm** — 4px base scale (`--st-gap-1…4`: 4/8/12/16). Data row height
22px, matching VS Code's list rows exactly. Control height 24px, radius 2px
(native input/button radius); surface radius 4px. Toolbar and banner share
one horizontal grid so the chrome reads as a single instrument panel.

**Motion** — `--st-fast: 120ms ease-out` for hover/selection;
`--st-reveal: 240ms` for detail panes; SIG-3's sweep 500ms. The existing
global reduced-motion rule stays and now actually has something to disable.

**Layout** — views stop being `max-height: 45vh` stacks
([main.ts](../src/views/main.ts) `.table-scroll`, `.feed`) and become full-height
CSS grids: banner / toolbar / content / detail, with the content region
owning scroll. The detail pane becomes a right rail at ≥720px width and a
bottom sheet below it.

## 6. Per-surface review

Each finding: **ID · severity (H/M/L) · the problem → the fix.** File
references point at the code as reviewed.

### 6.1 Explorer tree — `src/ui/explorerView.ts`, `src/explorer/model.ts`

- **TR-1 · H** — Primitive nodes are labeled with raw wire ids: `kv`, `json`,
  `events` (`getTreeItem` passes `node.primitive` straight through). Users
  read lowercase protocol vocabulary in a navigation surface. → Display
  names — **Key-Value, Documents, Events, Vectors, Graphs** — with counts as
  description; wire ids remain in tooltips for precision.
- **TR-2 · M** — Database `description` concatenates
  `state · managed · ⏪ as of …` with an emoji. → Codicon-and-text language:
  `$(history)` prefix for scrubbed, `$(vm-running)` for managed hosts;
  emoji leaves the tree entirely.
- **TR-3 · M** — `tooltip` is the bare `dbPath` string. → A `MarkdownString`
  card: path, state sentence, owner pid, branch, scrub position, client
  count — the status-bar card reused, so hover teaches the same facts
  everywhere.
- **TR-4 · L** — Branch nodes describe the current one as `selected`;
  load-more says `Load more… (100 loaded)`. → "current"; and when the total
  is known, "Load 100 more · 200 of 1,240".
- **TR-5 · H** — `viewsWelcome` still reads *"Database discovery and attach
  land in M2 — see docs/implementation-plan.md"*
  ([package.json](../package.json)) — stale scaffolding **shipped to users on
  an empty state, the first screen every new user sees.** → Rewrite: one
  sentence on what Strata is, then two command links — "Open a folder with a
  database" and "Clone a dataset from StrataHub…" — plus a walkthrough link.
- **TR-6 · L** — The view never uses `viewBadge`. → Badge = attached database
  count; it is the native "something is alive here" affordance.

### 6.2 Status bar — `src/ui/statusModel.ts`

- **SB-1 · H** — The item renders even when no databases exist
  (`$(database) StrataDB`), spending permanent status-bar real estate on
  nothing, and it never changes when the user scrubs — the window-level
  surface is silent about the one dangerous mode. → Hide when no databases
  are discovered; when any attached database is scrubbed, switch to
  `$(history) StrataDB · as of 14:32` with `statusBarItem.warningBackground`.
  This is SIG-2 at the window level.
- **SB-2 · M** — `client(s)` pluralization; owner facts join with `·` into
  dense lines. → Real pluralization; tooltip becomes a small markdown table
  (client / pid / access / protocol) with the self row bolded — it is
  already the best demo moment (agents visibly attached); typeset it.
- **SB-3 · M** — Clicking the item does nothing view-specific. → Click opens
  a status QuickPick: per-database rows (state, branch, scrub), then
  actions — Back to now, Open explorer, Run command.

### 6.3 Shared webview chrome — `src/views/main.ts`, `shared/banner.ts`

- **BN-1 · H** — The scope banner is one prose line:
  `branch default · space default ⏪ as of … — historical state; live refresh suspended · 100 loaded of 240`.
  Scope, mode, and pagination — three different kinds of information — share
  one string. → Structured bar on the shared grid: left, breadcrumb chips
  `database ▸ branch ▸ space` (mono); center, the mode cell — `● Live`
  (green dot, pulses on tick per SIG-3) or `$(history) As of Aug 5, 14:32 ·
  Back to now`; right, page facts in caption type. The emoji retires; the
  banner becomes the signature's home.
- **XC-1 · H** — No design system: default `<button>` everywhere, borders
  from four different grays, `45vh`/`70vh`/`75vh` magic scroll regions,
  8px body padding. → The §5 token layer plus restyled primitives (button,
  input, select, table, card, chip, toolbar) — one file, adopted by all five
  views; full-height grid layout replaces the vh caps.
- **XC-2 · M** — No iconography inside webviews at all (the CSP allows it —
  see §4). → Bundle codicon font; icons for toolbar verbs, banner mode,
  empty states, chain status.
- **XC-3 · M** — Webview panels have no `iconPath`
  ([webviewHost.ts](../src/ui/webviewHost.ts)) — every Strata tab shows the
  generic file glyph. → Per-primitive SVG tab icons (light/dark), matching
  the tree's icon set. Panel titles shorten: `KV · agent.strata`, space
  suffix only when not `default`.
- **XC-4 · H** — Time is machine-formatted everywhere: `microsToIso` prints
  `2026-08-05T14:32:07.123Z` into table cells, feed rows, and quickpick
  descriptions. → One `formatTime` module: relative under 24h ("2m ago"),
  short absolute otherwise ("Aug 5, 14:32:07"), full precision including
  microseconds always on hover (`title`) and in copies. Applied in webviews,
  tree tooltips, and quickpicks alike.
- **XC-5 · M** — Numbers are `String(n)`: no thousands separators, byte
  counts as `12345 bytes`. → `Intl.NumberFormat` everywhere; bytes humanized
  ("12.1 KB", exact on hover); all numerals tabular in data contexts.
- **XC-6 · H** — Loading is the string `loading…`; every render clears and
  rebuilds the whole DOM (`clear(this.root)`), so ticks can flash and drop
  scroll position. → Skeleton rows for first load (shimmer disabled under
  reduced motion); renders preserve the content region's scroll; the detail
  pane updates without rebuilding the table.
- **XC-7 · H** — Empty states are one gray fragment (`select a row to
  inspect`) or nothing (a space with zero rows renders an empty table). →
  Designed empty state per view: codicon, one sentence of what would appear
  here, and the action that gets you there (e.g., KV: "No keys in this
  space yet. Keys written by the owning app appear live — or seed one from
  the console.").
- **XC-8 · M** — Errors are `error: <message>` in red
  (`renderError` in every view). → Error card: title states what failed,
  body carries the server message verbatim, actions are Retry and — when
  the error is registry-coded — the docs link. Retention errors keep their
  distinct teaching treatment.
- **XC-9 · M** — Copy actions give zero feedback (`json-path` click writes
  to the clipboard silently, [jsonTree.ts](../src/views/shared/jsonTree.ts)). →
  A 900ms "Copied" confirmation at the click site; every copyable adds a
  hover affordance so copyability is discoverable at all.

### 6.4 KV table — `src/views/kvTable.ts`

- **KV-1 · M** — Sort state is text appended to the header (`key ▲`), no
  `aria-sort`. → Dedicated sort-glyph slot (codicon), `aria-sort`, hover
  affordance on sortable headers.
- **KV-2 · M** — Filter is case-sensitive `includes` over loaded rows, with
  no result count and no hint that unloaded rows are excluded. → Case-
  insensitive; live count ("8 of 100 loaded match"); when `hasMore`, the
  count links to Load more ("…search wider").
- **KV-3 · M** — Detail header is one concatenated string
  (`v3 · 2026-08-05T… · 42 bytes ·` + three form buttons). → Proper anatomy:
  key in mono with copy affordance; meta line (version chip, humanized time,
  humanized size); the text/JSON/hex toggle becomes a real segmented control
  (`radiogroup` semantics) — disabled segments explain why ("not valid
  UTF-8").
- **KV-4 · L** — Hex view is bare byte pairs. → Classic hexdump: offset
  column, 16 bytes, ASCII gutter — mono, selectable.
- **KV-5 · M** — Table region capped at `45vh` regardless of panel size;
  detail always below. → Full-height grid per XC-1; detail as right rail on
  wide panels.
- **KV-6 · H** — The history timeline is stacked default buttons. → The
  strata rail (SIG-1), verb "Scrub here."

### 6.5 JSON browser — `src/views/jsonBrowser.ts`

- **JS-1 · M** — Doc list is a column of default buttons; no filter over doc
  ids. → 22px list rows (list tokens for selection), mono ids, filter input,
  count in the list header.
- **JS-2 · M** — Diff legend is colored words (`added removed changed`) and a
  bare `clear` button; no counts. → Diff header chips with counts
  (`+3 added · −1 removed · ~2 changed`), "Exit diff", and the compared
  version named in humanized time. The tree keeps its current mark colors.
- **JS-3 · H** — Timeline: same default-button stack. → Strata rail, verb
  "Compare with current"; the entry being compared carries an active marker.
- **JS-4 · L** — `jsonTree` has no expand/collapse-all and long strings run
  unbounded. → Both; strings clamp at 240 chars with "show all"; add
  copy-value beside copy-path.
- **JS-5 · L** — Secondary indexes hide in an unstyled `<details>` labeled
  "secondary indexes (read-only)". → Eyebrow-labeled section, styled
  disclosure, the "(read-only)" qualifier moves to a tooltip — the whole
  product is read-only (AR-4); saying it here implies elsewhere is not.

### 6.6 Event feed — `src/views/eventFeed.ts`

- **EV-1 · H** — `pullLatest` calls `scrollToBottom()` whenever fresh events
  arrive — if the user scrolled up to read, a tick rips the viewport to the
  bottom. The one continuous-reading surface violates reading. → Follow
  mode: autoscroll only while pinned at bottom; otherwise a floating
  "↓ 3 new events" pill (the Linear/Slack pattern) that jumps and re-pins.
- **EV-2 · M** — Rows: seq in a 48px min-width span, type bold, ISO time. →
  Columnar rhythm: mono right-aligned seq gutter, type at weight 600,
  relative time; expanded payload indents under a hairline rail aligned to
  the gutter — the chain made visible. New entries get SIG-3's fade.
- **EV-3 · M** — Chain verification result is an inline colored string. →
  Status chip: `$(verified) Chain intact · 14 events` / broken state names
  the first bad sequence and clicking it scrolls to and expands that entry.
- **EV-4 · L** — Type filter is a raw `<select>` of names. → Styled select
  with per-type counts ("tool.call · 5").
- **EV-5 · L** — "Load earlier events…" gives no size. → "Load earlier ·
  120 before this" when the total is known.

### 6.7 Vector browser — `src/views/vectorBrowser.ts`

- **VC-1 · M** — Collection cards are default buttons with a bold line and a
  caption. → Card treatment on surface tokens: name, `3 vectors · 4d ·
  cosine` in caption type, selected state via accent border (list tokens).
- **VC-2 · L** — Norm column header is `‖v‖` — mathematically cute, opaque
  to half the audience. → Header "norm", tooltip "L2 norm ‖v‖"; values
  tabular, 4 decimals.
- **VC-3 · M** — History renders as inert chips (`timeline-chip` spans) —
  the only timeline in the product you cannot act on. → Strata rail, same
  verbs as KV.

### 6.8 Graph canvas — `src/views/graphCanvas.ts`

- **GR-1 · H** — `typeColor` is `hsl(hash·360 55% 55%)` — fixed lightness
  ignores theme: muddy on light themes, non-compliant in HC, and unrelated
  to every other color in the product. → Assign `--st-hue-1…6` (the theme's
  own chart hues) in first-seen order, overflow via `color-mix` between
  adjacent hues; swatches stay paired with text labels (N10). WCC components
  use the same palette.
- **GR-2 · H** — No zoom or pan: a fixed 1200×800 viewBox in a scrollable
  div. Beyond ~40 nodes the view is unusable. → Wheel zoom (cursor-anchored),
  drag pan, "Fit" button, zoom readout; `viewBox` transform only — no
  re-layout.
- **GR-3 · M** — Labels collide with edges and nodes. → Text halo via
  `paint-order: stroke` with `--vscode-editor-background` stroke — one CSS
  line, the single highest-leverage legibility fix on the canvas.
- **GR-4 · M** — Click both selects *and* expands (`activate()` does both) —
  reading a node's properties mutates the canvas. → Click selects;
  Enter/double-click expands; unexpanded nodes wear a subtle `+` ring so
  expandability is visible. Hover highlights incident edges and dims the
  rest (120ms).
- **GR-5 · M** — Edges are undirected lines; direction exists only in a
  hover `<title>`. → `marker-end` arrowheads at 60% opacity.
- **GR-6 · M** — Overlays have no legend: pagerank silently resizes radii,
  wcc recolors. → Toolbar chip while active ("pagerank · clear") plus a
  min→max size legend / component count legend in the sidebar.
- **GR-7 · L** — Truncation note is orange prose. → Info chip with the count
  and a "hide" affordance; copy shortens to "Expansion capped at 25
  neighbors."
- **GR-8 · L** — Sidebar sections are bold text (`ontology (complete)`). →
  Eyebrow-labeled sections (ONTOLOGY, SELECTION); the ontology status moves
  to a tooltip.

### 6.9 Console flows — `src/ui/consoleUi.ts`

- **CN-1 · H** — The form flow is a blind field-by-field `showInputBox`
  march: no step counter, no back, and — the trust gap — **no preview of
  what will be sent** before it executes. → VS Code's multi-step QuickInput
  pattern: `step`/`totalSteps`, back navigation, and a final summary step
  showing the exact wire JSON with "Send" — see precisely what leaves your
  editor, Stripe's API-explorer move, and it costs one screen.
- **CN-2 · M** — Palette items are text-only. → Family codicons matching the
  tree (`$(symbol-key) kv.get`), so the primitive icon language is
  consistent across tree, tabs, and palette.
- **CN-3 · L** — History quickpick shows raw ISO in the description and raw
  JSON as detail. → Relative time first ("2m ago · default"), payload
  preview clamped.
- **CN-4 · M** — Result/error docs open titled `console: kv.get` /
  `console error: kv.get`, which become tab names like
  `console_ kv.get.json`. → Clean slugs: `kv.get — result.json`,
  `kv.get — error.json`.
- **CN-5 · L** — `pickDatabase` lists basename + full path; fine — but the
  console title's context string (`agent.strata @ default ⏪ …`) predates
  the copy system. → Align with banner vocabulary: `agent.strata · default ·
  as of 14:32`.

### 6.10 Time travel & branch flows — `src/ui/timeTravelUi.ts`

- **TT-1 · M** — The scrub QuickPick's third row is a fake item (a hint that
  does nothing when picked). → Make it real: "Pick from a key's history…"
  opens a key picker (KV keys + doc ids), then that key's timeline —
  the flow closes instead of dead-ending.
- **TT-2 · L** — Title says "(currently scrubbed)" without the position. →
  "Time travel — agent.strata · as of Aug 5, 14:32".
- **TT-3 · M** — History quickpick descriptions are raw ISO
  (`new Date(...).toISOString()`). → Humanized times (XC-4); version and
  tombstone stay in the label.

### 6.11 Inspector documents — `src/ui/inspectorDoc.ts`

- **IN-1 · L** — Closed inspectors render `// closed` — invalid JSON in a
  JSON-mode document. → `{}` plus a set `languageStatus`-friendly title, or
  simply empty valid JSON.
- **IN-2 · L** — Titles pass through with spaces and colons into virtual
  filenames. → Slugify (CN-4 shares this).

### 6.12 First run & the storefront

- **FR-1 · H** — TR-5's stale welcome text (the single worst first
  impression in the product).
- **FR-2 · M** — The walkthrough is three text-only steps and stops before
  the product's actual magic — no time-travel step, no agent step, no
  imagery. → Five steps with SVG illustrations (shippable, theme-neutral):
  find/attach, start a host, watch it live, scrub time, register agents.
- **FR-3 · M** — Marketplace listing: no icon PNG (manifest has none), no
  gallery banner, README has no visual. → 128/256px icon rendered from
  `media/strata.svg`, `galleryBanner` color, one hero GIF (the event feed
  ticking, then a scrub) at the top of README. A visual-first listing is
  table stakes for "world-class" perception before anyone installs.

## 7. Copy & voice

One register everywhere: **plain, present tense, sentence case, zero
apology.** The interface is an instrument, not a mascot.

| Rule | Now | Becomes |
|---|---|---|
| Sentence case UI text | `select a row to inspect` | `Select a row to inspect it` |
| Verbs state outcomes | `clear` (diff) | `Exit diff` |
| Errors: cause, then action | `error: deadline exceeded` | `The owner didn't answer in time. Retry, or check the host's load.` + docs link |
| No protocol ids as labels | tree node `kv` | `Key-Value` (id in tooltip) |
| Time reads human | `2026-08-05T14:32:07.123Z` | `2m ago` (exact on hover) |
| One name per concept | scrubbed / historical / as-of | UI noun **“as of …”**, verb **scrub**, return **Back to now** |

Terminology registry (used by all surfaces, tests may grep for violations):
**attach** (never connect), **host** (the owning process), **branch**,
**space**, **scrub / as of / Back to now**, **live** (tick-subscribed),
primitives as **Key-Value, Documents, Events, Vectors, Graphs**.

## 8. Implementation plan

Three milestones. D1 makes excellence *possible* (infrastructure, tokens,
states, copy); D2 makes the product *recognizable* (signature + per-view
craft); D3 makes it *desirable from the outside* (delight + storefront).
Findings map to epics; nothing lands without its verification tier.

### Milestone D1 — Foundations

*Goal: no surface shows an undesigned state, a machine timestamp, or stale
copy; the visual test harness exists so D2 can iterate against pixels.*

- **U1 · Visual + a11y harness** *(infra, first — everything else iterates
  on it).* A static `test/visual/` harness page loads `dist/views/main.js`
  with a stubbed `acquireVsCodeApi` and fixture data per view × state
  (populated / empty / loading / error / scrubbed). Theme token CSS captured
  from the four stock themes. Playwright (dev-only) drives
  `toHaveScreenshot` for every cell of the matrix and runs axe on each;
  Linux CI job, artifacts uploaded. Native surfaces get a manual checklist
  appended to the release checklist.
  *Accepts:* matrix runs in CI; intentional visual changes are reviewed as
  image diffs in PRs.
- **U2 · Token layer & chrome** — §5 tokens; primitive restyle (button,
  input, select, table, card, chip); full-height grid layouts; banner
  redesign (BN-1); codicon bundling (XC-2); panel icons & titles (XC-3).
- **U3 · Time & number typesetting** — `formatTime`/`formatBytes`/
  `formatCount` modules; adopted across webviews, tree, status bar,
  quickpicks (XC-4, XC-5, TT-3, CN-3).
- **U4 · The state triad + feedback** — skeletons, scroll preservation
  (XC-6); designed empty states (XC-7); error cards (XC-8); copy feedback
  (XC-9); stale welcome + walkthrough copy fix (TR-5/FR-1 — *ship this in
  the first PR of D1; it is a one-line embarrassment*).
- **U5 · Native IA & copy pass** — tree labels/tooltips/badge (TR-1..4,
  TR-6); status bar states & click action (SB-1..3); console/result titles
  (CN-4..5); inspector placeholders (IN-1..2); §7 terminology sweep with a
  unit test greping banned strings (mirrors the N4 allowlist pattern).

*D1 acceptance:* every view × 4 stock themes × reduced-motion passes the
harness; zero raw ISO timestamps or `String(n)` counts in any surface; the
welcome view teaches instead of apologizing.

### Milestone D2 — Signature & per-view craft

- **U6 · The time signature** — `strataRail` shared component replacing all
  three timelines (SIG-1, KV-6, JS-3, VC-3); the amber past-wash with HC
  fallback (SIG-2); the deposit pulse + banner live dot (SIG-3); scrubbed
  status bar warning tint (SB-1's second half).
  *Accepts:* one component serves KV/JSON/vectors; wash approved across the
  theme matrix or consciously reduced to banner+border (the §3 gate);
  reduced-motion path verified.
- **U7 · KV & Documents craft** — KV-1..5; JS-1..5.
- **U8 · Event feed craft** — follow-mode pill (EV-1), row rhythm + arrival
  fade (EV-2), chain chip with jump-to-break (EV-3), EV-4..5.
- **U9 · Graph craft** — theme palette (GR-1), zoom/pan/fit (GR-2), label
  halos (GR-3), select-vs-expand + hover choreography (GR-4), arrowheads
  (GR-5), overlay legends (GR-6), GR-7..8.
- **U10 · Console & time-travel craft** — multi-step form with wire preview
  (CN-1), palette icons (CN-2), real history-pick flow (TT-1..2), vector
  cards & norm (VC-1..2).

*D2 acceptance:* a stranger shown any single view can say which product it
is (the rail or the banner is in frame); the feed never steals scroll; the
graph is legible at 100 nodes in Light Modern.

### Milestone D3 — Delight & the storefront

- **U11 · Micro-delight** — graph hover-dim polish, norm mini-bars, feed
  type-count chips, status tooltip client table (SB-2 finish), any motion
  still missing its reduced-motion twin gets it or gets cut.
- **U12 · Storefront** — walkthrough with five illustrated steps (FR-2);
  marketplace icon + gallery banner + README hero GIF (FR-3); listing
  screenshots regenerated from the harness fixtures so they stay current.

*D3 acceptance:* the Marketplace page communicates live-ness and time travel
before install; walkthrough completion leaves a user having actually
scrubbed time once.

### Sequencing & risk

| Risk | Mitigation |
|---|---|
| The wash (SIG-2) fights a community theme | Bounded mix + HC fallback + explicit D2 gate to demote to banner-only |
| Playwright dev-dep weight in CI | Linux-only job, browser cached; harness is plain Chromium (no Electron) |
| Full-DOM re-render conflicts with scroll preservation (XC-6) | Do U2's grid layout first; keyed row reuse only where measurement proves flashing (feed, KV) |
| Copy sweep breaks tests asserting old strings | The terminology test lands in the same PR as the sweep |
| Icon/typography drift between tree, tabs, palette | One mapping module (`primitiveDisplay.ts`) exports name + codicon + SVG ref for all surfaces |

### Traceability

Every epic stays inside the V1 invariants: theme tokens and strict CSP (N8),
no telemetry and value-free logs (N4 — the terminology test extends the
existing allowlist pattern), keyboard/reduced-motion/contrast (N10 — now
verified by harness instead of by intent), read-only surface (AR-4), and the
scenario ledger (N7) is untouched — this plan changes presentation, not
wire behavior. New runtime footprint: one font file (codicons) and two SVG
sets; zero new runtime dependencies.

## 9. Non-goals

- No brand accent color, gradients, or shadows — VS Code's surface language
  wins; themes keep their temperature.
- No custom chrome over native surfaces (no webview reimplementation of the
  tree, quickpick, or diff editor).
- No web fonts, remote assets, or network of any kind in webviews.
- No animation without a reduced-motion twin; no information carried by
  color alone.
- No design work that implies write affordances in V1.
