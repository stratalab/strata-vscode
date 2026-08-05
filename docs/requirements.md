# StrataDB for VS Code — V1 Requirements

**Status:** Revised against the landed IPC contract (protocol revision 2)
**Date:** 2026-08-05 (original 2026-08-04)
**Repo:** `stratalab/strata-vscode`
**Upstream contract:** `strata-core` executor IDL v1 + executor IPC protocol revision 2
(`docs/architecture/ipc/ipc-evolution-design.md`, slices A–C landed and tested)

---

## 1. Context

Developers building on Strata run their apps and agents against an embedded database.
While the app runs, its state — KV, JSON, events, vectors, graph, across branches and
versions — is invisible without dropping into the CLI. This extension puts a live,
read-only window on that state inside the editor: open the folder containing a Strata
database, watch your agent's memory change as it works, scrub back in time, and inspect
any row on any branch without ever contending with the app for the database.

Two architectural commitments anchor everything below:

1. **The extension is an IDL surface.** It consumes the same executor IDL v1 that the
   CLI, MCP server, and Python SDK consume. No hand-rolled command definitions; the
   command catalog, request/response schemas, error registry, and read/write
   classification are all generated from vendored IDL artifacts.
2. **The extension is an IPC protocol-revision-2 client.** It attaches as a socket
   client to the process that owns the database — introducing itself with a hello,
   declaring a read-only session the owner *enforces*, and subscribing to version
   ticks instead of polling. The extension never embeds the engine and never takes
   the storage writer lock in-process.

V1 is strictly **read-only**: an observer surface. Writes (including branch creation)
are deferred to a later version.

*Revision note:* the original draft was written against a wire with no handshake, no
server-side access control, and no notifications, and carried workarounds for each.
The upstream hardening track (strata-core #2871, slices A–C, merged 2026-08-05)
delivered all three plus per-request deadlines, typed capacity refusals, and client
identity reporting — this revision designs against that contract directly.

---

## 2. Product scope

### In scope (V1)

| # | Feature | One-liner |
|---|---------|-----------|
| F1 | Live database explorer | Tree of databases → branches → spaces → primitives; browse and inspect rows while another process writes |
| F2 | Branches + time travel | Branch picker, branch inspection, side-by-side branch comparison, and a time-travel scrubber (`as_of`) over reads and history |
| F3 | Command console | Run read-class IDL commands against the database from a panel; typed forms from JSON Schemas plus a raw wire-JSON mode |
| F4 | Primitive-specific views | Each primitive opens into a view shaped like its data: KV table, JSON document browser, live event feed, vector collection browser, interactive graph canvas |

### Out of scope (V1)

- **All writes** — KV/JSON/event/vector/graph mutation, branch create/fork/delete,
  space create/delete, `arrow.import`, `ipc_stop`. The wire already enforces
  read-only sessions server-side, so adding write UX later is a product decision,
  not an infrastructure one.
- **Search & retrieval panel** — deferred; revisit once the console proves the interaction model.
- **Inference/generation UI** — the `inference` family is not surfaced.
- **Windows** — the executor IPC transport is Unix-only today (see §7).
- **StrataHub browsing**, remote databases, fleet views.
- **Any query DSL** — the console speaks IDL commands and wire JSON, per the no-DSL principle.

---

## 3. System context

### 3.1 The ownership model and the wire (as landed in strata-core)

Storage admits exactly **one read-write process per database** — the first opener takes
the `locks/writer` flock. The executor's IPC layer makes multi-process access a
*transport* concern: the owning process may host a Unix domain socket at
`<data_dir>/strata.sock`, and every other process becomes a client of the owner.
There is no daemon and no server product; hosting is a side effect of opening the
database with `IpcMode::Host`.

What the wire now guarantees (protocol revision 2; see Appendix A for frame shapes):

- **Negotiated sessions.** A hello first frame declares protocol revision, IDL
  stamps, client identity, intended access, and a capability want-list; the owner
  answers with its own stamps, release, granted access, and pid. Version skew is
  detected by contract, not heuristics.
- **Server-enforced read-only.** A session declaring `access: "read"` cannot mutate
  the store: the owner rejects every write-classified command at its dispatch gate
  with `access_denied.executor.read_only_session`. The classification is
  conformance-pinned to the IDL `access` facet for all 127 commands, zero exceptions
  (`ipc_stop` and `hub_clone` are writes — a read-only observer cannot stop the
  owner's transport).
- **Correlated frames.** Every request carries an `id` echoed on the response frame;
  pipelining is permitted with responses in request order.
- **Version ticks.** A subscribed connection receives coalesced, lossy, metadata-only
  `{"notify": {"event": "version", "version": N}}` pushes when the store's write
  watermark advances — including for the owner's own in-process writes. Latency is
  bounded at ~150 ms. Ticks are store-scoped (per-branch is a future additive field).
- **Deadline shedding.** A request may carry `deadline_ms`; if the budget expires
  while the request waits for the execution lane, the owner sheds it with
  `unavailable.executor.ipc_deadline` instead of executing for a caller that gave up.
- **Typed capacity refusals.** Past the 128-connection cap the owner writes a
  `resource_exhausted.executor.ipc_connections` frame instead of silently dropping.
- **Attributable clients.** `ipc_status` reports every connection —
  `{name?, version?, pid?, access, protocol}` — as introduced by its hello.

What the wire deliberately does **not** guarantee in V1:

- **Parallel execution.** Requests from all clients plus the owner's own work
  serialize through one execution lane (audit NODE-11; G8 parked by decision).
  Multiple readers get concurrent *access*, not concurrent *execution* — the guest
  discipline in §6 N2 is the mitigation.
- **Mid-command interruption.** Deadlines shed *queued* work; a command already
  executing runs to completion. Cancellation is phase-2 (engine cooperation).
- **Windows transport** (G10 open).

### 3.2 Which processes can the extension attach to today

| Owner process | Hosts a socket? | Extension can attach? |
|---|---|---|
| `strata start <db>` | Yes (`Host`, forced) | Yes — the canonical companion; its readiness report publishes the socket path |
| `strata` REPL (interactive TTY) | Yes (`Host` default) | Yes |
| `strata mcp serve` | Yes (`Host` default) | Yes — a Claude-driven agent session is observable live |
| One-shot `strata` command | No (`Client`, brief lock) | n/a (transient) |
| App embedding `stratadb` (Rust facade) | **No** — facade re-exports engine only | **No** |
| App on `strata-python` | **No** — executor built without the `ipc` feature | **No** (strata-python#68 is the one-line fix) |
| App on `strata-nodesdk` | **No** — binds the embedded facade, pre-IDL | **No** (strata-nodesdk#22) |
| Unowned database (no process) | — | Extension starts a managed host (AR-3) |

The headline scenario — *watch your app's database live* — works today when the app
side is driven through the CLI/MCP surface or when the extension itself hosts, and
reaches full strength when the sibling-repo issues land.

---

## 4. Architecture requirements

### AR-1 — IDL consumption

- **AR-1.1** Vendor the `idl/v1` directory from `strata-core`, pinned by a
  `STRATA_CORE_REV` file, mirroring the established `strata-python` pattern. The
  release tarball (`strata-idl-docs.tar.gz`) is the acceptable alternative source.
- **AR-1.2** A build-time generator emits TypeScript types for all commands and
  outputs, the command catalog (id, title, summary, kind, access, pagination,
  `cli_surface`, `path_display`), and the error registry (code, class,
  `retry_policy`, `commit_outcome`, hint) from `generated/command-index.json` +
  `generated/schemas/*.json` + `errors.yaml`.
- **AR-1.3** Generated code is committed and CI-guarded: regeneration against the
  pinned rev must produce no diff, and a coverage guard fails if a catalog command is
  neither surfaced nor listed in a shrink-only exclusion ledger.
- **AR-1.4** Validate the IDL version stamps at generation time and against the
  owner's hello at attach time (AR-6).
- **AR-1.5** The IDL `access` facet drives the console's write-command UX (AR-4.2).
  Upstream pins runtime enforcement to the same facet, so the extension's view of
  "what is a write" and the owner's can never disagree.
- **AR-1.6** The console reaches commands by **wire type**, not CLI verb paths — 19
  commands are `cli_surface: wire` and have no CLI verb.
- **AR-1.7** Wire values are base64 (`Bytes` fields); CLI examples show plain text.
  The generated types own this boundary — no hand-encoded keys anywhere in the
  extension. (This footgun bit during upstream test-writing; the types are the fix.)

### AR-2 — IPC protocol-revision-2 client

- **AR-2.1** A native TypeScript client speaks the socket protocol directly: Unix
  domain socket, 4-byte big-endian length-prefixed frames, 64 MiB frame cap, JSON
  payloads, per Appendix A. No subprocess per request on any interactive path.
- **AR-2.2** Socket discovery replicates the executor's rules: `<data_dir>/strata.sock`,
  the `<data_dir>/strata.sock.path` pointer file, `<data_dir>/strata.pid` — or, when
  the extension starts the host itself, the socket path from the `ipc_started`
  readiness report (AR-3.2).
- **AR-2.3** On connect, the client sends a hello with `protocol: 2`, its vendored
  IDL stamps, identity `{name: "strata-vscode", version, pid}`, `access: "read"`,
  and `capabilities: ["notify.version"]`. A refused hello
  (`invalid_argument.executor.ipc_hello`) is surfaced as a version-mismatch state,
  never a retry loop.
- **AR-2.4** Two fixed connections per attached database: one **interactive** (all
  tree/inspector/console requests, one in-flight at a time, correlation ids
  verified on every response) and one **subscriber** (version ticks). Never more.
- **AR-2.5** Every interactive request carries `deadline_ms` matched to its class
  (fast reads ~2 s; paged scans ~10 s; console raw commands user-configurable). A
  shed (`unavailable.executor.ipc_deadline`) renders as "the database owner was busy
  past this request's budget" with a retry affordance — the request provably did not
  execute (`commit_outcome: not_started`). The client still keeps its own transport
  timeout slightly above the deadline for the in-flight-command case the server
  cannot shed.
- **AR-2.6** Every request carries an explicit `branch` (and `space` where
  applicable); the extension never relies on session stickiness.
- **AR-2.7** Handle the registered transport errors by code, never message text:
  `invalid_argument.executor.wire_request`, `invalid_argument.executor.ipc_hello`,
  `unavailable.executor.ipc_transport` (owner died — reconnect/rediscover),
  `unavailable.executor.ipc_deadline` (shed — retryable),
  `resource_exhausted.executor.ipc_connections` (owner at capacity — backoff),
  `access_denied.executor.read_only_session` (should be pre-empted by AR-4.2; if it
  arrives, it is a bug in the client gate, log it as such),
  `internal.executor.wire_response`, and `unavailable.engine.persistence`.

### AR-3 — Attach and host model

- **AR-3.1** **Attach first.** If a live socket exists, connect as a pure client.
  The extension never takes the writer lock in-process.
- **AR-3.2** If the database is unowned, offer **"Start database host"**: spawn a
  managed `strata start <db>` child. Its lifecycle is tied to the workspace session;
  readiness (and the socket path) is parsed from the `ipc_started` JSON line; stop
  via `strata stop` semantics. This keeps the database attachable by every other
  reader. (This exact topology — start-host, raw-socket subscriber, one-shot writer —
  is validated upstream by cross-process tests on durable databases.)
- **AR-3.3** The `strata` binary is discovered via user setting, then `PATH`; not
  bundled in V1. Missing binary degrades to a setup prompt.
- **AR-3.4** Database discovery: workspace scan for Strata layout markers plus
  explicit configured paths. Cache-mode databases (no socket, no lock, by design)
  are out of reach and reported as such.
- **AR-3.5** The status bar renders `admin.ipc_status`: owner pid, hosting state,
  and the `clients` list — every attached client's name, version, pid, access, and
  protocol, with this extension's own entry highlighted. Anonymous (protocol-1)
  entries render as "unidentified client". Owner death/handoff reflects within one
  tick interval.

### AR-4 — Read-only, enforced twice

- **AR-4.1** The session declares `access: "read"` at hello, and **the owner is the
  enforcement boundary**: every write-classified command is rejected at the dispatch
  gate before execution. The extension cannot mutate the store even if its own logic
  is wrong.
- **AR-4.2** The client-side gate remains as UX, generated from the IDL `access`
  facet: write commands appear greyed-out in the console with the reason
  ("StrataDB for VS Code v1 is read-only") — discoverability without capability,
  and no wasted round trips.
- **AR-4.3** Receiving `access_denied.executor.read_only_session` from the owner
  therefore indicates a client-gate bug (or catalog skew) — surface it as a
  diagnostic, not a user-facing "permission denied".

### AR-5 — Liveness by subscription

- **AR-5.1** The subscriber connection sends
  `{"id": 1, "subscribe": {"events": ["version"]}}` after its hello and treats each
  `notify` push as "state changed": refresh visible tree levels and open inspectors.
  No polling loop exists anywhere in the extension.
- **AR-5.2** Ticks are coalesced and lossy (latest-wins); the payload's `version` is
  an opaque watermark — compare for advance, never interpret. Ticks may fire for
  write *attempts* that failed (safe direction for a refresh hint); a spurious
  refresh is acceptable, a missed one is not, and the wire guarantees the latter
  cannot happen while connected.
- **AR-5.3** On subscriber reconnect (owner restart, transport error), re-read the
  visible state once — the tick stream carries no replay.
- **AR-5.4** Refreshes triggered by ticks are debounced (~200 ms) and paused while
  no Strata view is visible; the subscription itself stays open (a parked
  connection costs the owner nothing).

### AR-6 — Version skew

- **AR-6.1** Compare the owner's hello (`idl` stamps, `release`) against the
  vendored catalog's stamps at attach. On mismatch: degrade — hide commands the
  owner doesn't know, warn once, never hard-fail the surface.
- **AR-6.2** All request DTOs are `deny_unknown_fields` upstream: the extension must
  never send fields outside the vendored schema, and must tolerate unknown fields in
  responses on display-only paths (e.g., future additive `branch` on ticks).

### AR-7 — VS Code integration contract

- **AR-7.1 Activation.** Lazy: on the Strata view container opening, on a `Strata:`
  command, or on a cheap workspace file-presence check for Strata layout markers —
  never a startup scan. Near-zero cost until used.
- **AR-7.2 Contribution points.** An activity-bar container ("StrataDB") hosting the
  explorer tree and status; F4 views open as webview editor tabs; all commands under
  the `Strata:` palette prefix; context menus on tree nodes; a first-run walkthrough
  (find/point at a database, install the CLI, start a host).
- **AR-7.3 Settings inventory** (all `strata.*`): `binaryPath` (machine-scoped —
  AR-7.5), `databases[]` (explicit paths beyond workspace discovery), deadline
  budgets per request class, default page size, tick-refresh debounce, and
  host-autostart (default off, pending Q1). Only non-security settings are
  workspace-overridable.
- **AR-7.4 Remote development.** `extensionKind: ["workspace"]` — the extension must
  run where the database lives, because the transport is a local Unix socket. SSH /
  WSL / devcontainers work by running the extension remotely; a UI-only install
  cannot function and says so instead of failing quietly.
- **AR-7.5 Workspace trust.** The extension executes the `strata` binary, so:
  `binaryPath` is machine-scoped and never read from workspace settings, and in an
  **untrusted workspace the extension is attach-only** — it will connect to an
  existing socket (needs no binary) but never spawns a process.
- **AR-7.6 Multi-database.** Every attached database has independent connections,
  branch selection, and view state; multi-root workspaces are supported.

### AR-8 — Lifecycle and state

- **AR-8.1 Managed host lifetime.** A host the extension started (AR-3.2) is stopped
  on deactivation. If VS Code dies hard, the orphaned host keeps serving — it is a
  legitimate owner, and that is safe by design; the next activation recognizes it
  from the recorded pid and re-adopts it as managed rather than starting a second.
- **AR-8.2 Reconnect matrix.** Transport error → rediscover the socket and reattach
  with bounded backoff; socket gone and database unowned → surface the start-host
  offer; after every reattach, a fresh hello (the owner may have been upgraded —
  re-run AR-6) and the AR-5.3 re-read.
- **AR-8.3 Persistence.** Per workspace: selected branch per database, tree
  expansion, console history, managed-host records. The time-travel scrubber is
  session-only — every reload returns to "now".
- **AR-8.4 Deactivation.** Close connections cleanly, stop managed hosts. Read-only
  means there is never anything to flush.

---

## 5. Functional requirements

### F1 — Live database explorer

- **F1.1** Tree: workspace databases → branches → spaces → primitives
  (kv / json / events / vectors / graph) → entries. Counts via the `*.count`
  commands; entries via cursor-paginated `list`/`scan`, never unbounded reads.
- **F1.2** The tree is navigation; opening a primitive lands in its dedicated view
  (F4). A lightweight row inspector remains available from every view for the raw
  record: decoded values, versions, and the "Copy as" affordances of F1.3.
- **F1.3** Every inspected item offers "Copy as wire JSON" and "Copy as CLI command"
  (from the catalog's `path_display`).
- **F1.4** Live refresh per AR-5: version ticks drive visible-view refresh; nothing
  refreshes on a timer.
- **F1.5** Pagination discipline: page sizes capped (default 100, max 1 000);
  "load more" is always explicit. Nothing the explorer issues may exceed the 64 MiB
  frame cap or hold the execution lane for a perceptible interval.
- **F1.6** Every database renders one of a closed set of attachment states, each a
  teaching state rather than an error toast:
  **attachable** (socket live) · **unowned** (start-host offer) ·
  **owned but unreachable** (lock held, no socket — an `IpcMode::Off` owner or a
  bind failure; named by pid when readable) · **at capacity**
  (`resource_exhausted.executor.ipc_connections` — retry affordance) ·
  **version mismatch** (hello refused — names both versions) ·
  **pre-V1 layout** (`failed_precondition.engine.layout_version` — explains the
  clean-break policy) · **cache mode** (unreachable by design, stated as such).
  An unhealthy database offers a "Run doctor" action (spawns `strata doctor`,
  renders its report; trusted workspaces only per AR-7.5).

### F2 — Branches and time travel

- **F2.1** Branch picker scoped per database (`branch.list`, `branch.get`); the
  explorer tree and console operate in the context of the selected branch (AR-2.6).
- **F2.2** Time-travel scrubber: a version/timestamp control that sets `as_of` on
  every read the active view issues. The UI states clearly when it is showing
  historical state, and tick-driven refresh is suspended while scrubbed into the past.
- **F2.3** History views for versioned primitives via `kv.history`, `json.history`,
  `vector.history` — a per-key/document timeline that drives the scrubber.
- **F2.4** Branch comparison: side-by-side read of the same key/document/subtree on
  two branches (client-side diff of two reads — no engine diff surface exists).
- **F2.5** Handle `history_unavailable.*` and unretained-version errors as
  first-class UI states ("this version is no longer retained"), not error toasts.

### F3 — Command console

- **F3.1** Command palette over the read-class catalog (82 commands), grouped by
  family, searchable by id, title, and summary — all from vendored IDL prose.
- **F3.2** Two input modes: a form generated from the command's JSON Schema, and a
  raw wire-JSON editor with schema validation before send.
- **F3.3** Results rendered by response shape (`result` model from the catalog):
  tables for pages, inspectors for single values, cursor continuation for paged
  results. Every result offers "Copy as wire JSON".
- **F3.4** Expensive kinds (graph analytics, `read.search`, `arrow.export`) carry an
  explicit confirmation noting they hold the single execution lane (§3.1), and run
  with a longer, user-visible `deadline_ms`.
- **F3.5** Error results render the full envelope — class, code, `retry_policy`,
  `commit_outcome`, hint, and the `stratadb.org/e/<code>` link.
- **F3.6** Console history persists per workspace; entries are replayable.

### F4 — Primitive-specific views

Each primitive gets a view shaped like its data model, not a generic table. This is
where the extension earns the "why doesn't every database work like this?" reaction —
and it inherits the role (and the per-primitive color identity) from Strata Foundry's
views, which are on ice for V1. All views obey the shared discipline: read-class
commands only, capped pages, `deadline_ms` on every request, tick-driven refresh
(AR-5), and full participation in the time-travel scrubber (F2.2) — a view scrubbed
into the past renders historical state and suspends live refresh.

- **F4.1 — KV: table view.** Sortable columns (key, decoded value preview, version);
  prefix/range filtering via `kv.scan`; value cell expands to the inspector with
  text / JSON / hex rendering toggles (values are bytes — the view auto-detects but
  never guesses silently). Per-key history (`kv.history`) renders as a version
  timeline that drives the scrubber for that key.
- **F4.2 — JSON: document browser.** Document list with id/version; the selected
  document renders as a collapsible tree with path breadcrumbs (copyable as a JSON
  path). Secondary indexes are listed read-only. Selecting two versions of a
  document (via `json.history` or two scrubber positions) renders a client-side
  structural diff — the time-travel payoff made visible.
- **F4.3 — Events: live feed.** Chronological, append-only stream (`event.range` /
  `event.range_time`), newest at the bottom, paged backward from the head; filter by
  event type (`event.types`). With a live subscription, new events append in place —
  the "watch your agent think" moment. Each entry shows its chain position; a
  "verify chain" action runs `event.verify_chain` (read-class) and renders the
  integrity result inline.
- **F4.4 — Vectors: collection browser.** Collection cards (dimensions, distance
  metric, count, index diagnostics from the `vector.index` read surface); entries as
  a metadata-first table — float payloads are summarized (dimensions, norm), never
  dumped by default (F1.2 discipline). Per-entry history via `vector.history`.
  *Stretch (flagged, not committed):* a 2D projection scatter of a bounded
  `vector.sample` (≤500 entries, explicit user action, client-side projection) —
  bounded enough to respect the lane and the frame cap, deferred if it threatens
  the V1 timeline. Similarity search stays out of V1 with the search panel (§2).
- **F4.5 — Graph: interactive canvas.** A webview node-link canvas built by
  **neighborhood expansion, never whole-graph pulls**: seed from a selected node or
  type, expand adjacency on click with bounded depth and fan-out, client-side
  force-directed layout. Nodes/edges colored and filterable by ontology type, with
  an ontology sidebar (object types, link types — the `graph.ontology` read
  surface). Analytics overlays (pagerank, wcc, …) reuse the console's
  expensive-command confirmation (F3.4) and colorize the current canvas from the
  result. Selecting a node opens the row inspector with its properties and
  cross-primitive bindings.
- **F4.6** Every view states its scope honestly: branch, space, scrubber position,
  page boundaries, and "N more — load" affordances. No view ever silently truncates
  (the no-silent-caps rule).

---

## 6. Non-functional requirements

- **N1 — Responsiveness.** The extension host never blocks on IPC; all transport is
  async with AR-2.5 deadline budgets. Tree expansion targets <150 ms against a local
  owner for one page.
- **N2 — Good-citizen load.** With subscriptions replacing polling, steady-state
  background traffic is **zero**. The remaining discipline is about the shared
  execution lane: capped pages, deadlines on everything, expensive commands behind
  confirmations. The owner's app workload has priority; the extension is a guest.
- **N3 — Error discipline.** All error handling keys on `class` + `code`, never
  display text. Unknown codes degrade to class-level behavior.
- **N4 — Security & privacy.** Same-user socket only; no credentials exist to manage.
  Row contents never leave the machine; logs redact values by default. The client
  registry identity the extension reports (AR-2.3) is display metadata, not
  authentication.
- **N5 — Platforms.** macOS and Linux. Windows is blocked upstream (G10) and out of
  scope until it lands.
- **N6 — Packaging.** Publisher `stratalab`, extension id `strata-vscode`,
  marketplace name "StrataDB". No telemetry in V1.
- **N8 — Webviews.** The richer F4 views (graph canvas, JSON tree, event feed) are
  VS Code webviews: fully self-contained bundles, strict CSP, no CDN or network
  fetches (N4 extends to view assets), theme-aware (VS Code light/dark/high-contrast
  tokens), and virtualized so a capped page renders smoothly. Tree views stay native
  where a webview adds nothing.
- **N9 — Release engineering.** Marketplace publishing via `vsce`; the extension
  versions independently of Strata (semver), with the supported `strata` range
  stated in the README and enforced at attach via the hello (Q3). A
  `STRATA_CORE_REV` bump is a PR that re-vendors, regenerates, and passes the
  coverage guard — never a silent update. CI runs the N7 suite on macOS and Linux
  against a `strata` binary built from the pinned rev (a downloaded release binary
  once the release train exists). Every release has a CHANGELOG entry.
- **N10 — Accessibility and language.** Tree items, status bar, and webviews carry
  screen-reader labels; webviews are keyboard-navigable; the graph canvas honors
  reduced-motion; primitive identity never relies on color alone (icons differ, in
  the Foundry palette). English-only V1.
- **N7 — Testing.** Mirror the upstream cross-process pattern (`strata start` owner +
  raw-socket sessions on durable databases): extension CI attaches to a real host and
  exercises hello/skew, the read gate (as a client-bug detector), tick-driven
  refresh, deadline sheds, capacity refusal, and owner-death recovery. UI logic is
  tested against recorded wire transcripts. The IDL toolchain's generated fixtures
  are the request corpus.

---

## 7. Upstream dependencies

### Delivered (strata-core #2871, slices A–C, merged 2026-08-05)

- ~~D1 — read-only client sessions~~ → server-enforced at the dispatch gate,
  conformance-pinned to the IDL. (AR-4)
- ~~D3 — protocol/capability handshake~~ → the hello, both directions. (AR-2.3, AR-6)
- ~~D4 — change notification~~ → version-tick subscriptions. (AR-5)
- Beyond the original asks: per-request deadlines, typed capacity refusals, and
  client identities in `ipc_status`.

### Still open (none block extension V1)

- **D2 — Parallel read execution** (G8, #2879): parked by decision. Until then the
  single-lane guest discipline (N2) is the mitigation.
- **D5 — Windows transport** (G10, #2881): gates N5 expansion.
- **D6 — `strata-python` IPC participation** (strata-python#68): the one-line
  feature addition that makes Python-hosted apps attachable — the biggest
  reach-multiplier for the headline scenario.
- **D7 — `strata-nodesdk` executor cutover** (strata-nodesdk#22): makes Node apps
  attachable; potential shared TypeScript wire core (open question Q2).
- **D8 — Published IDL artifacts**: the release tarball suffices; a stratadb.org
  mirror would remove the release-fetch step.

---

## 8. Open questions

- **Q1** Should "Start database host" (AR-3.2) be automatic on first browse of an
  unowned database, or always an explicit user action? (Draft assumes explicit.)
- **Q2** Does the extension ship its own generated TypeScript wire core, or wait and
  share one with a cut-over `strata-nodesdk` (D7)? (Draft assumes own core now,
  converge later.)
- **Q3** Minimum supported `strata` binary version — V1 GA only, or best-effort
  against pre-GA dev builds? (The hello makes either enforceable.)
- ~~**Q4** Is `ipc_status` sufficient for the status bar?~~ **Resolved:** yes —
  `clients` now carries name/version/pid/access/protocol per connection (AR-3.5).
- **Q5** Publish to the VS Code Marketplace only, or also Open VSX (VSCodium,
  Cursor, and other forks)? (Draft assumes both — same artifact, near-zero cost,
  and the AI-editor forks are squarely the audience.)

---

## Appendix A — Wire protocol summary (protocol revision 2, as landed)

Frames are 4-byte big-endian length + JSON payload; 64 MiB cap. Authoritative
source: `strata-core` `crates/executor/src/ipc/` and
`docs/architecture/ipc/ipc-evolution-design.md`.

**Hello** (first frame; refusal closes the connection):

```json
→ {"hello": {"protocol": 2,
             "idl": {"schema_version": "strata.idl.v1", "generator_version": "strata-executor-idl.1"},
             "client": {"name": "strata-vscode", "version": "0.1.0", "pid": 4242},
             "access": "read",
             "capabilities": ["notify.version"]}}
← {"type": "ipc_hello", "data": {"protocol": 2, "release": "1.0.0",
             "idl": {…}, "granted_access": "read",
             "capabilities": ["notify.version"], "owner_pid": 1234}}
```

**Correlated request / response** (`id` required; `deadline_ms`, `branch`, `space`
optional; `command` is the raw executor wire command):

```json
→ {"id": 7, "deadline_ms": 2000, "branch": "main",
   "command": {"type": "kv_get", "key": "aGk="}}
← {"id": 7, "payload": {"type": "kv_versioned_value", "data": {…}}}
← {"id": 7, "payload": {"error": {"class": "…", "code": "…", "retry_policy": "…",
                                   "commit_outcome": "…", "message": "…"}}}
```

**Subscribe / notify** (subscriber connection; ack carries the accepted event set;
pushes are coalesced, lossy, and never interleave inside a response):

```json
→ {"id": 1, "subscribe": {"events": ["version"]}}
← {"id": 1, "payload": {"type": "ipc_subscribed", "data": {"events": ["version"]}}}
← {"notify": {"event": "version", "version": 812}}
```

**Registered transport-level error codes:**

| Code | Class | Retry | Meaning |
|---|---|---|---|
| `invalid_argument.executor.ipc_hello` | invalid_argument | never | Malformed hello / unsupported protocol revision |
| `invalid_argument.executor.wire_request` | invalid_argument | never | Malformed envelope (incl. missing `id` on protocol 2) |
| `access_denied.executor.read_only_session` | access_denied | never | Write command on a read session |
| `unavailable.executor.ipc_deadline` | unavailable | same_request | Budget expired waiting for the lane; not executed |
| `resource_exhausted.executor.ipc_connections` | resource_exhausted | same_request | Owner at its connection cap |
| `unavailable.executor.ipc_transport` | unavailable | unknown | Connection lost mid-flight (in-doubt) |
| `internal.executor.wire_response` | internal | unknown | Server-side serialization/panic guard |

---

## 9. References (strata-core, at the pinned rev)

- IPC evolution design (the wire contract): `docs/architecture/ipc/ipc-evolution-design.md`;
  tracking issue strata-core#2871 (slices A–C merged)
- IPC implementation: `crates/executor/src/ipc/` (`protocol.rs` frame shapes,
  `server.rs` gate/ticks/shed, `connection.rs` broker dance)
- Cross-process test pattern to mirror: `crates/cli/tests/ipc_start_stop.rs`
- IDL runbook: `crates/executor/idl/v1/README.md`; overlay strategy:
  `docs/architecture/v1-idl-overlay-strategy.md`
- Generated artifacts: `crates/executor/idl/v1/generated/`
- Error registry: `crates/executor/idl/v1/errors.yaml`, `docs/errors/registry.md`
- Python SDK vendoring pattern: `stratalab/strata-python` (`idl/v1/STRATA_CORE_REV`,
  `tools/generate.py`)
