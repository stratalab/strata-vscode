# StrataDB Object Browser UX

**Status:** proposed
**Date:** 2026-09-01
**Scope:** the primary branch/space data browsing surface in `strata-vscode`
**Companion docs:** [requirements.md](requirements.md), [design-plan.md](design-plan.md), [implementation-plan.md](implementation-plan.md)

This document defines the target experience for the StrataDB object browser:
the view a user opens when they select a space in a branch. The goal is a
database cockpit that feels obvious the first time, stays fast with millions
of objects, and can grow from focused KV/JSON edits into broader write actions
without a redesign.

The standard is not "more UI." It is an interface where the user always knows:

- where they are: database, branch, space, live or historical
- what they are looking at: object kind, key/name, shape, version, time
- what is loaded versus what exists in the database
- what will happen before any write reaches the engine

## 1. Research Basis

The design is grounded in current database-extension and VS Code guidance:

- VS Code UX guidance says extensions should fit native workbench patterns:
  use tree views for data navigation, keep view counts low, use product icons,
  avoid noisy webviews, use clear command names, keep context menus contextual,
  limit notifications, and make webviews themeable and accessible.
- VS Code Webview guidance says webviews are appropriate for custom surfaces
  that native APIs cannot express, but they must use theme tokens, restrictive
  local resources, keyboard access, ARIA labels, and high-contrast support.
- Redis for VS Code and Redis Insight establish the expected database-browser
  baseline for key-value stores: connect, browse, sort, filter by key/name or
  pattern, filter by type, group namespaces, inspect values with human-readable
  formatters, and perform CRUD once writes are enabled.
- MongoDB for VS Code separates navigation from work: connect and navigate
  databases/collections/documents, then use richer editor surfaces for query
  prototyping and document inspection.
- DataGrip reinforces mature database-tool behaviors: database explorers need
  configurable grouping/sorting/filtering, schema visibility controls, compact
  object tabs, read-only modes, and generated write previews before structural
  changes are applied.

Product implications:

- The sidebar is a map. The object browser is the work surface.
- Large data browsing must be paged and engine-backed; local filtering is only
  a temporary refinement over loaded rows.
- Search is not an advanced mode. It is a primary control, left-aligned and
  live.
- Focused KV/JSON writes can be inline, but broader writes need a
  draft/review/commit model so power never feels casual.
- Errors and empty states should teach the next action inline. Notifications
  are reserved for background or cross-view events.

References checked:

- [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [VS Code Views UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/views)
- [VS Code Webviews UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews)
- [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VS Code Quick Picks UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/quick-picks)
- [VS Code Context Menus UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/context-menus)
- [VS Code Notifications UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/notifications)
- [Redis for VS Code docs](https://redis.io/docs/latest/develop/tools/redis-for-vscode/)
- [Redis Insight Browser docs](https://redis.io/docs/latest/develop/tools/insight/)
- [MongoDB for VS Code docs](https://www.mongodb.com/docs/mongodb-vscode/)
- [DataGrip Database Explorer docs](https://www.jetbrains.com/help/datagrip/database-explorer.html)
- [DataGrip Tables docs](https://www.jetbrains.com/help/datagrip/working-with-the-data-editor.html)
- [DataGrip Schemas docs](https://www.jetbrains.com/help/datagrip/schemas.html)

## 2. Product Thesis

The object browser should feel like sitting in a high-end car for the first
time: no manual, no clutter, no mystery. The important controls are where the
hand expects them, secondary controls are nearby but quiet, and the system
communicates state before the user has to ask.

For Strata, that means:

- one obvious list of objects for the selected space
- immediate search and type filters at the top-left
- a dense table/list that can scale to millions of records
- a detail pane that makes the selected object useful immediately
- live mode and time-travel mode that are impossible to confuse
- future writes that feel powerful but never casual

The object browser should not feel like five mini-products placed behind five
buttons. It should feel like one instrument panel for a branch/space, with
different object kinds rendered intelligently.

## 3. Naming

Use language that matches the user's mental model, not the engine's internal
taxonomy.

| Engine concept | UI term | Notes |
|---|---|---|
| database path | Database | Use the folder name as primary text; path in tooltip/details. |
| branch | Branch | Show all branches in the tree. No branch picker as the only path. |
| space | Space | Treat like a schema. Use schema-like iconography. |
| primitive | Type | Do not show "primitive" in product UI. |
| kv | Key | The object row label is the key. |
| json | Document | Document id is the object name. |
| event | Event | Sequence and type appear as metadata. |
| vector | Vector Collection | Collection row opens vectors inside it. |
| graph | Graph | Graph name opens graph summary and seed. |

Required visible labels:

- `All`
- `Keys`
- `Documents`
- `Events`
- `Vectors`
- `Graphs`
- `Search keys...` or `Search objects...`
- `Load more results`
- `Live`
- `As of <time>`
- `Back to now`

Avoid:

- `Attach`
- `Primitive`
- raw wire ids as visible navigation labels
- modal jargon such as "hydrated", "materialized", or "wire shape"

## 4. Information Architecture

### Sidebar Explorer

The explorer remains a low-density navigation map:

```text
Database
  Branch
    Space
```

Clicking a space opens the object browser for that branch/space. The sidebar
does not expand into millions of keys. It should show structure, not data.

Database context menu:

- Connect
- Disconnect
- Refresh
- Remove Database
- Reveal in File Explorer
- Run Doctor

Branch context menu:

- Open Branch
- Compare With...
- Time Travel...
- Copy Branch Name

Space context menu:

- Open Object Browser
- Copy Space Name
- Refresh Space
- V2: New Object...
- V2: Delete Space... only if the engine supports safe deletion and the space
  is empty or a confirmation preview is available

Do not put `Time Travel` on the database node. Time travel is branch/space/view
context, not a whole-app database action in the user's mental model.

### Object Browser

The browser owns the actual data surface:

```text
scope banner
toolbar: [All Keys Documents Events Vectors Graphs] [search] [sort] [V2 New]
content: object table/list
detail: selected object, right rail on wide screens, bottom pane on narrow screens
```

The first viewport should always show the real data surface. No landing page,
no hero, no explanation card.

## 5. Layout Contract

### Banner

The banner is a permanent, compact state bar:

- left: database / branch / space breadcrumb
- center: `Live` or `As of <time>`
- right: loaded/result facts
- action: `Back to now` only when scrubbed

Examples:

```text
world-bank-indicators / default / default     Live               100 loaded of 1,204,300
world-bank-indicators / default / default     As of Aug 5 14:32  12 matching "IND" of 100 loaded     Back to now
```

The banner must distinguish:

- live data
- historical/as-of data
- stale/disconnected data
- read-only mode
- pending write draft in V2

### Toolbar

The toolbar is left-aligned. Its order is stable:

1. Type filters: `All`, `Keys`, `Documents`, `Events`, `Vectors`, `Graphs`
2. Search input
3. Sort control
4. View options menu
5. V2 `New` split button

The type filters and search input must sit on the same left edge. The search
input must never float to the far right. On narrow widths, controls wrap in
that same order, with search taking a full row only when needed.

### Object List

The list is optimized for scanning:

| Column | Purpose |
|---|---|
| Type | Short pill with icon: Key, Doc, Event, Vector, Graph. |
| Name | Key, document id, event type/sequence, collection, graph. |
| Preview | Human-readable summary, never raw envelope JSON. |
| Version | Commit version when meaningful. |
| Time | Humanized timestamp when meaningful. |
| Size/Count | Bytes for values, vector count, graph count, event payload size. |

Rules:

- fixed row height
- no card grid for rows
- no row layout shift on hover or selection
- selected row remains selected across refresh if it still exists
- if a filter hides the selected row, clear the detail pane
- `Load more results` loads the next page for the active query, not the next
  unfiltered page

### Detail Pane

The detail pane answers "what is this?" without opening a raw JSON file.

Common header:

- object type
- object name/key
- copy action
- version
- timestamp
- byte length or count
- V2 dirty/draft state if editing

Per-type rendering:

- Key: value as `Table`, `JSON`, `Text`, `Hex`, with best form selected
  automatically. JSON objects render as field/value tables first, raw JSON
  behind a disclosure.
- Document: JSON tree with copyable paths, structural diff when comparing
  versions.
- Event: event type, sequence, payload, hash, previous hash, chain status.
- Vector Collection: collection stats first, then vectors as a paged table;
  vectors show key, dims, norm, metadata preview.
- Graph: graph summary first, ontology counts, seed nodes/edges, then graph
  canvas only when useful and bounded.

The detail pane must never show protocol envelopes like:

```json
{
  "database": "...",
  "branch": "...",
  "space": "...",
  "key": { "text": "...", "base64": "..." },
  "found": true
}
```

Those fields belong in copy/export/debug tools, not the primary object browser.

## 6. Search And Filtering

Search is a first-class control. It is left-aligned and live.

### V1 Behavior

Until the engine exposes server-side key filtering, the extension may filter
the currently loaded rows only. When it does, the UI must be honest:

```text
2 matching "IND" of 100 loaded
```

The filter applies to object names only by default:

- KV key label
- JSON document id
- event type and sequence label
- vector collection name
- graph name

It does not search values or previews unless the user explicitly enables a
future "Include values" mode. This matches the user's expectation when they say
"hide rows that do not have IN in the keys."

### Matching Semantics

Default local matching:

- case-insensitive
- delimiter-insensitive for common key separators: spaces, `.`, `_`, `:`, `-`
- substring match over normalized names
- stable order from the current result set

Example:

```text
Loaded rows: India, Indonesia, Canada
Query IN:    India, Indonesia
Query INDI:  India
Query IND:   India, Indonesia
```

If the user deletes characters, previously matching loaded rows return
immediately. No network request is required for this local refinement.

### Engine-Backed Behavior

For real scale, filtering must move into `strata-core`; see
[strata-core#3017](https://github.com/stratalab/strata-core/issues/3017).

Target behavior:

- debounce live requests, about 120 ms after input stops
- cancel or ignore stale responses
- query the engine with branch, space, type filter, query, mode, cursor, limit,
  and read selector
- keep local filtering as a fast refinement only when the engine response is
  still in flight
- page through matching results, not the unfiltered keyspace
- show whether results are `prefix`, `contains`, or `fuzzy`

Search modes:

| Mode | Default? | Notes |
|---|---|---|
| Prefix | Yes once engine exists | Efficient over ordered keys; best first engine implementation. |
| Contains | Later | Needs explicit performance contract or an index. |
| Fuzzy | Later | Needs ranking semantics and probably an index. |

Never imply database-wide completeness when only loaded rows have been filtered.

## 7. Sorting And Grouping

Default order:

- `All`: stable engine order grouped lightly by type only in the Type column,
  not by section headers
- `Keys`: engine key order
- `Documents`: document id order
- `Events`: newest last for live feed mode; newest first for table mode if we
  add a toggle
- `Vectors`: collection name order
- `Graphs`: graph name order

Sort control:

- name ascending/descending
- version newest/oldest where applicable
- time newest/oldest where applicable
- type order in `All`

Grouping:

- no deep namespace tree by default
- optional `Group by namespace` view option for key-heavy spaces
- namespace separator defaults to `:`
- grouping must never prevent search from showing flat results

## 8. V2 Write UX

V2 writes should be designed as a controlled draft system, not as hidden inline
side effects. The user should always know the exact target and operation before
the engine mutates data.

### Write Entry Points

Toolbar:

- `New` split button
- menu items: `Key`, `Document`, `Event`, `Vector Collection`, `Graph`

Row/detail actions:

- Edit
- Rename where supported
- Duplicate
- Delete
- Copy as JSON
- Copy CLI Command
- View History

Command Palette:

- `Strata: New Key`
- `Strata: New Document`
- `Strata: Delete Object`
- `Strata: Commit Draft`

Context menus expose only actions valid for that node type. Large action sets
move into submenus.

### Draft Model

Every write starts as a draft in the detail pane or a dedicated editor tab.

Draft states:

- clean: viewing committed data
- editing: local changes exist, no engine mutation has happened
- validating: schema/command validation is running
- ready: preview is available and commit is enabled
- committing: request sent; controls disabled except cancel when supported
- committed: engine ack received, version shown
- failed: inline error with retry and copy diagnostics

The browser shows a compact draft bar:

```text
Draft: update Key India in default/default     Review & Commit     Discard
```

No mutation is sent on blur, row change, tab close, or selection change.

### Review And Commit

Before commit, the user sees:

- database
- branch
- space
- object type
- operation
- key/name/id
- generated command or wire request
- diff/preview when meaningful

For JSON and text values, show an inline diff. For binary values, show size and
hex preview. For destructive operations, require explicit confirmation in the
dialog. For bulk operations, require a count and sample rows.

Commit success:

- selected row updates after engine ack
- new version is shown in the banner/detail
- latest history entry appears at the top of the rail
- a subtle live deposit pulse is enough; no success notification unless the
  action completed in the background or another view must be alerted

Commit failure:

- leave the draft intact
- show inline error
- offer retry and copy diagnostics
- do not clear user input

### Time Travel And Writes

Writes are disabled while viewing historical/as-of state.

The disabled action explains:

```text
Back to now to edit this object.
```

Future option, if supported by the engine:

```text
Create branch from this point...
```

Writes should not be allowed directly against an as-of view.

### Read-Only And Trust Boundaries

Write controls can be visible but disabled when writes are unavailable. The
reason must be specific:

- action requires a resolved `strata` binary
- workspace is untrusted
- connected session is read-only
- owner rejected write access
- engine command is unavailable for this IDL revision
- historical view is active

The user should never have to click a disabled write action to learn why it is
disabled; the tooltip and detail bar must say it.

## 9. States

### Empty

Empty space:

```text
No objects in this space
New data written by your app appears here live.
```

V2 adds primary action:

```text
New Object
```

### Loading

Initial load:

```text
Loading objects...
```

Search:

```text
Searching keys...
```

Use inline progress in the view, not notification toasts.

### Filter Empty

```text
No objects match "INDI"
```

If local-only:

```text
No loaded objects match "INDI"
Load more or clear the search.
```

### Large Result Set

```text
100 loaded of 1,204,300
```

Never render a million rows. Use fixed pages, explicit `Load more results`,
and later virtualization if needed.

### Disconnected

Show the last known scope and a primary inline action:

```text
Database disconnected
Connect to continue browsing.
```

No stale rows without a stale/disconnected marker.

### Busy Owner

When the owner sheds a request due to deadline:

```text
The database owner was busy past this request's budget.
Retry
```

Do not call this a failure if the engine says the command did not start.

## 10. Keyboard And Accessibility

Required keyboard behavior:

- `Tab` reaches toolbar, search, table rows, detail actions, and history rail.
- `/` focuses search when the table owns focus.
- `Esc` clears search if search is focused and non-empty; otherwise returns
  focus to the table.
- Up/down moves table selection without losing detail context.
- `Enter` opens/selects the focused row.
- `Cmd/Ctrl+C` copies the selected object name when the table owns focus.
- `Cmd/Ctrl+Enter` commits a ready draft in V2.
- `Esc` never discards a draft without confirmation.

Accessibility requirements:

- all icon-only buttons have labels/tooltips
- color is never the only state signal
- high-contrast themes are tested
- reduced motion disables pulses and transitions
- table row counts and filter result counts are announced with `aria-live`
  politely
- draft dirty state is announced

## 11. Performance Contract

The object browser must stay interactive under large data.

Budgets:

- first meaningful paint after opening a space: under 500 ms when the owner is
  responsive
- live local filtering over loaded rows: under 16 ms for 1,000 rows
- engine-backed search request debounce: about 120 ms
- stale search responses ignored by generation id
- no unbounded client-side accumulation
- default page size: 100
- hard page size cap: 1,000

Rules:

- the sidebar never lists raw keys
- object rows are shaped extension-side, not raw command envelopes
- value bodies load on selection, not during list fetch
- previews are bounded
- large binary values default to metadata and hex preview
- graph and vector details are sampled/bounded first

## 12. Visual Direction

This is an operational developer tool. It should feel quiet, fast, and exact.

Do:

- use VS Code theme colors and product icons
- keep rows dense and aligned
- use fixed dimensions for controls and rows
- use tabular numerals for versions, counts, timestamps, and sizes
- make live/historical/read-only state visible without being loud
- reserve motion for live updates and commit acknowledgement

Do not:

- use marketing-style cards or hero sections
- use decorative gradients or abstract art
- hide core actions behind explanatory text
- create separate mini-app aesthetics per object type
- show raw envelopes in primary views

The signature remains Strata's time model: live data accumulates, historical
views are clearly historical, and history rails make versions tangible.

## 13. Acceptance Criteria

### OB-1: Object Browser Replaces Primitive Browsing

- Clicking a space opens one object browser.
- The browser shows mixed objects with type filters.
- Primitive-specific views can still exist as deep/detail modes, but not as
  the primary navigation model.

### OB-2: Search Is Immediate And Honest

- Search is left-aligned.
- Typing filters visible rows live.
- Case-insensitive key/name matching works.
- Removing characters restores prior matches.
- The banner says whether counts refer to loaded rows or database-wide engine
  results.

### OB-3: Large Databases Do Not Break The Model

- The sidebar never expands into unbounded key lists.
- The object browser uses bounded pages.
- `Load more results` respects the active type filter and search query.
- Engine-backed prefix search replaces local-only filtering when
  `strata-core#3017` lands.

### OB-4: Details Are Human-Readable

- Selecting a key never opens raw protocol JSON.
- JSON-like KV values show field/value tables first.
- Binary values show safe metadata and hex preview.
- Every detail pane has copy actions, version metadata, and history where
  supported.

### OB-5: Writes Fit Without Redesign

- The toolbar has a reserved `New` position.
- Detail panes have reserved action space for Edit/Delete/Duplicate.
- Focused KV/JSON create/edit actions can use compact inline editors.
- Draft state can be represented in the banner/detail without layout changes.
- Historical/as-of mode disables writes with a clear reason.
- Review/commit can show target, command, diff, and confirmation.

### OB-6: Native VS Code Quality

- Commands use clear `Strata:` names.
- Context menus are contextual and short.
- Notifications are rare.
- Theme, high contrast, keyboard, and reduced-motion checks pass.
- No row/control text overlaps at common sidebar/editor widths.

## 14. Implementation Roadmap

### Phase 1: Current V1 Object Browser

- Keep the unified space browser experiment.
- Rename product language toward object browser where appropriate.
- Keep filters and search left-aligned.
- Implement live local key/name filtering over loaded rows.
- Keep details human-readable, especially KV object values.
- Preserve read-only browsing guarantees while allowing explicit trusted writes.

### Phase 2: Scale-Correct Search

- Implement or consume engine-level paginated key search from
  `strata-core#3017`.
- Add debounce, stale-response guards, and result-count honesty.
- Change `Load more` to `Load more results` under active search.
- Add query mode metadata once engine supports prefix/contains/fuzzy.

### Phase 3: Detail Pane Maturity

- Add size/time/version columns consistently.
- Add sort and view options.
- Add namespace grouping as an option, not the default.
- Add richer vector and graph detail summaries.
- Add visual QA across dark, light, and high-contrast themes.

### Phase 4: Broader Write Preparation

- Expand disabled write affordances with exact reasons.
- Build draft state plumbing without sending mutations.
- Add review/commit UI against mocked write commands.
- Add destructive action confirmations.
- Add tests for time-travel write disabling and draft preservation.

### Phase 5: Broad Writes

- Request write-capable sessions only when the user opts into writes.
- Keep read-only browsing as the default safety posture.
- Send writes only from review/commit actions.
- Reflect committed versions in the object list and history rail after engine
  acknowledgement.

## 15. Open Decisions

- Should `All` search all object names, or should it search keys only until
  engine search supports every object type?
- Should `Keys` become the default filter for key-heavy spaces, or should `All`
  always be first for conceptual simplicity?
- Should namespace grouping be automatic when most keys share a delimiter, or
  only user-enabled?
- In V2, should writes require an explicit write-mode toggle per database, or
  is a commit review sufficient?
- Should the extension support "create branch from this historical point" as
  the escape hatch from read-only time travel?
