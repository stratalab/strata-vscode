# StrataDB for VS Code — V1 Implementation & Test Plan

**Status:** Draft for review
**Date:** 2026-08-05
**Requirements:** `docs/requirements.md` (revised against IPC protocol revision 2)
**Proposed pin:** `STRATA_CORE_REV = 2556b6be` — current `strata-core` tip; verified
locally to contain slices A–C (hello, read gate, ticks, deadlines, client identities)
and the cross-process wire tests we mirror.

---

## 1. Approach

Three principles order everything below:

1. **Contract first.** The IDL toolchain (AR-1) and the wire client (AR-2) are built
   and hardened before any UI exists, because every feature consumes them. The
   generated catalog is the single source of truth from day one — no interim
   hand-rolled command definitions that later migrate.
2. **Harness early.** The N7 cross-process test harness (real `strata start` owner,
   raw-socket sessions, durable temp databases) is a deliverable of the *first* wire
   milestone, not a hardening-phase afterthought. Every subsequent epic lands with
   integration tests riding on it, and UI epics consume wire transcripts it records.
3. **A demo per milestone.** Each milestone exits with something runnable that a
   founder can watch: ticks in a log, a live tree, a scrubbed view, an agent's
   writes streaming in. This keeps the build honest against the headline scenario.

Sizing tags: **S** ≈ days, **M** ≈ 1–2 weeks, **L** ≈ 2–4 weeks, single engineer.
Parallelism opportunities are called out in §5.

---

## 2. Milestone map

| Milestone | Theme | Epics | Exit demo |
|---|---|---|---|
| M0 | Foundations | E0 scaffold, E1 IDL toolchain | CI green on macOS+Linux; catalog regenerates with no diff; coverage guard live |
| M1 | We speak the wire | E2 wire client, E3 test harness | Harness starts a host, extension client attaches, CLI writes, version ticks logged live |
| M2 | First light | E4 attach/host/lifecycle, E5 explorer + status bar | Open a workspace, browse a database in the tree, watch it change while another process writes |
| M3 | Time travel & console | E6 branches/time travel, E7 command console | Scrub a KV key's history; diff a branch; run any read command from a generated form |
| M4 | The views | E8 webview infra, E9 KV+JSON, E10 events+vectors, E11 graph | Every primitive opens into its shaped view; the event feed streams an agent session |
| M5 | Ecosystem | E12 hub clone, E13 MCP registration | Clone a hub dataset and open it; register MCP, watch the agent's session appear in the status bar and its writes hit the views |
| M6 | Ship | E14 hardening, a11y, release | Installable `.vsix` from CI; marketplace + Open VSX listings; full demo script passes on a clean machine |

---

## 3. Epics

### M0 — Foundations

#### E0 — Extension scaffold & CI skeleton (S)

Covers: AR-7.1, AR-7.2 (stubs), AR-7.4, AR-7.5 (manifest), N5, N6.

- `package.json` manifest: publisher `stratalab`, id `strata-vscode`, name
  "StrataDB"; `extensionKind: ["workspace"]`; `capabilities.untrustedWorkspaces`
  limited per AR-7.5; activation events per AR-7.1 (view container, `Strata:`
  commands, workspace-contains check) — never `*`.
- `engines.vscode` floor pinned to the release where `McpServerDefinitionProvider`
  is stable (verify at kickoff — this is F6.1's API floor).
- Toolchain: TypeScript strict, esbuild bundling, eslint, vitest for unit tests,
  `@vscode/test-electron` harness wired but near-empty.
- CI: lint + unit on macOS and Linux from the first commit.

Tests: activation smoke (extension activates on each declared event, and does
nothing on unrelated workspaces); manifest lint (no `*` activation, trust
declaration present).

Done when: CI is green on both platforms and an empty extension installs and
activates lazily.

#### E1 — IDL vendoring & TypeScript generator (M)

Covers: AR-1.1–AR-1.7, AR-6.2 (DTO strictness at the type level).

- Vendor `idl/v1` from `strata-core` at the pinned rev; `STRATA_CORE_REV` file;
  a `tools/vendor.ts` that re-vendors from a local checkout or the release tarball.
- `tools/generate.ts` emits committed `src/generated/`: request/response types for
  all 127 commands, the command catalog (id, title, summary, kind, access,
  pagination, `cli_surface`, `path_display`), and the error registry (code, class,
  `retry_policy`, `commit_outcome`, hint).
- `Bytes` fields typed as a branded base64 type with encode/decode at the boundary
  (AR-1.7) — plain strings do not typecheck into key fields.
- CI guards: regeneration against the pinned rev produces no diff; coverage guard
  fails if any catalog command is neither surfaced nor in the shrink-only exclusion
  ledger (AR-1.3). The ledger starts life listing every command and shrinks as
  epics land — it doubles as the feature-coverage burn-down.

Tests: generator snapshot tests; stamp validation (AR-1.4); asserted counts
(127 total / 82 read — drift means the pin moved without a regen); guard
failure-mode tests (added command → guard fails; ledger grows → CI fails).

Done when: `npm run generate` is deterministic, guards are enforced in CI, and the
catalog/type surface is importable by downstream code.

### M1 — We speak the wire

#### E2 — Wire protocol client (L)

Covers: AR-2.1–AR-2.7, AR-4.2/4.3 (client gate), AR-5.1–AR-5.4 (transport side),
AR-6.1, AR-8.2 (reconnect mechanics), N1 (async discipline), N3.

- Frame codec: 4-byte big-endian length prefix, 64 MiB cap, JSON payloads;
  incremental parser tolerant of partial reads.
- Connection state machine: connect → hello (`protocol: 2`, vendored stamps,
  identity, `access: "read"`, `capabilities: ["notify.version"]`) → ready;
  refused hello surfaces as version-mismatch state, never a retry loop (AR-2.3).
- Interactive connection: single in-flight request queue, correlation-id
  verification on every response, per-class `deadline_ms` injection (fast ~2 s,
  paged ~10 s, console-configurable), client transport timeout slightly above the
  deadline (AR-2.5); explicit `branch`/`space` on every request (AR-2.6).
- Subscriber connection: subscribe after hello, coalesced tick dispatch with
  debounce hook and visibility pause hook (AR-5.4); reconnect triggers the
  re-read callback (AR-5.3).
- Error taxonomy: every registered code mapped to a typed outcome (AR-2.7);
  unknown codes degrade to class-level behavior (N3);
  `access_denied.executor.read_only_session` routed to the diagnostic channel as a
  client-gate bug (AR-4.3).
- Client-side write gate generated from the `access` facet (AR-4.2) — the client
  refuses to *send* write-classified commands.
- Reconnect with bounded backoff; fresh hello and skew re-check after every
  reattach (AR-8.2, AR-6.1).

Tests (unit, fake server): codec round-trip and torn-frame fuzzing; frame-cap
rejection; correlation mismatch detection; deadline injection per class; every
registered error code's mapping; unknown-field tolerance on responses (AR-6.2).

Tests (integration, on E3 harness — the N7 list):
- hello/skew: healthy attach; mismatched stamps → degrade path; protocol refusal → mismatch state
- read gate as client-bug detector: raw test connection sends a write → owner
  refuses with `read_only_session`; extension client refuses to send it at all
- tick-driven refresh: CLI write → tick within the bounded latency; coalescing
  under write bursts
- deadline shed: occupy the lane with an expensive command, issue a tiny-deadline
  request → `ipc_deadline`, `commit_outcome: not_started`
- capacity refusal: saturate the 128-connection cap → typed
  `ipc_connections` refusal, backoff behavior
- owner death: kill the host mid-session → `ipc_transport`, rediscover, reattach,
  re-read fires

Done when: the full N7 wire scenario list passes against a real host in CI on both
platforms.

#### E3 — Cross-process test harness & transcript recorder (M)

Covers: N7 (infrastructure), N9 (CI shape).

- Harness library: create durable temp databases, seed via one-shot CLI writes,
  spawn/kill `strata start` owners, parse `ipc_started`, open raw-socket test
  sessions, helpers for busy-lane, connection-saturation, and owner-kill scenarios.
  Mirrors `crates/cli/tests/ipc_start_stop.rs`.
- Transcript recorder: capture wire exchanges from harness sessions into committed
  JSON fixtures; a fake-server replayer feeds them to UI/unit tests so view logic
  never needs a live host.
- CI: build the `strata` binary from the pinned rev, cached by rev hash, on both
  platforms (swap to downloaded release binaries when the release train exists — N9).

Done when: E2's integration suite runs on the harness in CI, and a recorded
transcript replays deterministically through the fake server.

### M2 — First light

#### E4 — Attach, host, and lifecycle (M)

Covers: AR-3.1–AR-3.5, AR-8.1–AR-8.4, AR-7.5 (behavioral), F1.6 (state model).

- Database discovery: workspace scan for layout markers + `strata.databases[]`;
  cache-mode detection and reporting (AR-3.4).
- Socket discovery per the executor's rules (AR-2.2); attach-first (AR-3.1).
- Managed host: spawn `strata start`, parse readiness, tie lifetime to the
  session, stop on deactivate; orphan re-adoption from recorded pid (AR-8.1,
  AR-8.4); binary resolution via setting then `PATH`, setup prompt when missing
  (AR-3.3); untrusted workspaces are attach-only — no spawns of any kind (AR-7.5).
- The closed attachment-state machine (F1.6): attachable · unowned ·
  owned-but-unreachable · at-capacity · version-mismatch · pre-V1 layout ·
  cache-mode; "Run doctor" action on unhealthy states (trusted only).
- Status bar from `admin.ipc_status`: owner pid, hosting state, client list with
  own entry highlighted, "unidentified client" for protocol-1 entries; refreshes
  on ticks (AR-3.5).
- Workspace persistence layer: selected branch, tree expansion, console history,
  managed-host records; scrubber explicitly not persisted (AR-8.3).

Tests: integration — unowned → start-host → attach; simulated hard death →
orphan re-adopted, not duplicated; owner killed → reconnect matrix walks the
states (AR-8.2); every F1.6 state manufactured by the harness (lock held with
`IpcMode::Off`, saturated connections, stamp mismatch, cache-mode layout) and
asserted against the state machine. Unit — discovery rules on fixture directory
layouts; persistence round-trip.

Done when: a workspace with any mix of owned/unowned/broken databases renders
every database in its correct teaching state, and managed-host lifetime survives
the kill/restart matrix.

#### E5 — Explorer tree, inspector, live refresh (M)

Covers: F1.1–F1.5, AR-5 (UX side), AR-4 (surface behavior), N1, N2.

- Tree provider: databases → branches → spaces → primitives → entries; counts via
  `*.count`; cursor-paginated `list`/`scan` with capped pages (default 100, max
  1 000) and explicit "load more" (F1.5).
- Row inspector (webview-less, native detail view for now): decoded values,
  versions, "Copy as wire JSON" / "Copy as CLI command" from `path_display`
  (F1.2, F1.3).
- Tick-driven refresh of visible levels and open inspectors, debounced ~200 ms,
  paused when no Strata view is visible (F1.4, AR-5.4). No timers anywhere —
  enforced by a lint rule banning `setInterval` outside the test tree.
- First-run walkthrough stub (AR-7.2): find a database, install the CLI, start a
  host.

Tests: transcript-driven tree-model tests (expand each level against recorded
pages); pagination discipline (no unbounded reads — fake server asserts every
scan carries a limit); integration — CLI writes while the tree is open → visible
rows update within one debounce window; visibility pause verified; N1 perf smoke
(one-page expansion against a local host; soft target 150 ms, hard CI failure at
500 ms to stay flake-tolerant).

Done when: the M2 exit demo runs — browse and inspect a live database while a
CLI session writes to it, no polling, correct pagination.

### M3 — Time travel & console

#### E6 — Branches & time travel (M)

Covers: F2.1–F2.5, AR-2.6 (branch plumbing at the UX level).

- Branch picker per database (`branch.list`, `branch.get`); selected branch flows
  through every request; persisted per workspace (AR-8.3).
- `as_of` scrubber: version/timestamp control on the active view; clear
  historical-state indication; tick refresh suspended while scrubbed (F2.2);
  session-only.
- History timelines via `kv.history` / `json.history` / `vector.history` driving
  the scrubber (F2.3).
- Branch comparison: side-by-side client-side diff of two reads (F2.4).
- `history_unavailable.*` and unretained-version errors as first-class UI states
  (F2.5).

Tests: harness seeds a scripted multi-version, multi-branch history; scrub
positions assert exact historical values; refresh-suspension verified while
scrubbed; unretained-version fixture renders the retention state, not a toast;
branch diff asserted against known divergence.

#### E7 — Command console (M)

Covers: F3.1–F3.6, AR-1.5/1.6 (catalog-driven UX), AR-4.2 (greyed writes).

- Palette over the 82 read-class commands, grouped by family, searchable by
  id/title/summary from vendored prose; write commands present but greyed with
  the read-only reason (F3.1, AR-4.2).
- Input modes: JSON-Schema-generated form and raw wire-JSON editor with pre-send
  validation (F3.2); commands addressed by wire type (AR-1.6).
- Result rendering by the catalog's `result` model: tables for pages with cursor
  continuation, inspectors for single values, "Copy as wire JSON" everywhere
  (F3.3).
- Expensive-kind confirmation (graph analytics, `read.search`, `arrow.export`)
  noting the single execution lane, with longer user-visible deadline (F3.4).
- Full error envelope rendering with the `stratadb.org/e/<code>` link (F3.5).
- Replayable per-workspace history (F3.6).

Tests: form generation snapshot across **all 82** read schemas (the IDL
`examples/` corpus as inputs — this is the coverage-guard payoff); validation
rejects malformed raw JSON before send; every result model shape renders from
transcripts; expensive-command flow gates on confirmation; error envelope renders
every registry field; history replay round-trips.

### M4 — The views

#### E8 — Webview infrastructure (M)

Covers: N8, N4 (asset locality), N10 (webview a11y base), AR-7.2 (editor tabs).

- Shared webview host: strict CSP, zero network access, self-contained bundles;
  VS Code theme-token bridge (light/dark/high-contrast); typed message protocol
  between extension host and view; per-view state persistence; a virtualized
  list/table primitive every view reuses.
- Views are framework-free TS modules with a thin DOM layer so their logic runs
  headless under vitest + jsdom against transcript fixtures.
- Base a11y contract: keyboard navigation, focus management, screen-reader
  labels, reduced-motion hook (N10).

Tests: CSP lint on built bundles (no external URL survives bundling); theme
snapshot in all three theme kinds; message-protocol unit tests; virtualization
renders a max-size page (1 000 rows) without frame drops in a scripted scroll.

#### E9 — KV table + JSON document browser (M)

Covers: F4.1, F4.2, F4.6, F2.2 participation.

- KV: sortable columns, prefix/range filter via `kv.scan`, value cell → inspector
  with text/JSON/hex toggles (auto-detect, never silently guess), per-key history
  timeline driving the scrubber.
- JSON: document list, collapsible tree with copyable path breadcrumbs, read-only
  index listing, client-side structural diff between two versions.
- Both: scope banner (branch, space, scrubber position, page boundaries,
  "N more — load") per F4.6.

Tests: transcript-driven rendering including maximum-page sizes; bytes rendering
toggles against adversarial values (invalid UTF-8, huge blobs, empty); JSON
structural diff against fixture pairs (adds/removes/moves/type changes); scrubbed
state suspends live refresh; scope banner asserted on every state.

#### E10 — Event feed + vector browser (M)

Covers: F4.3, F4.4, F4.6.

- Events: backward-paged chronological feed, newest at bottom, type filter, live
  append on ticks, chain position display, inline `event.verify_chain` result.
- Vectors: collection cards (dims, metric, count, index diagnostics),
  metadata-first entry table (payloads summarized, never dumped), per-entry
  history. 2D projection scatter is **stretch, feature-flagged** — bounded
  `vector.sample` ≤500, explicit action; first thing cut under schedule pressure.

Tests: feed pagination from a seeded event chain (ordering, no gaps or dupes
across page boundaries); live append under a write burst (coalescing respected);
verify-chain rendering for both intact and tampered fixtures; vector summaries
never include raw float payloads in the DOM by default.

#### E11 — Graph canvas (L)

Covers: F4.5, F4.6, F3.4 reuse.

- Neighborhood expansion only — seed from node or type, bounded depth/fan-out
  expansion on click, client-side force layout; **whole-graph pulls are
  structurally impossible** (no code path issues an unbounded traversal).
- Ontology sidebar from `graph.ontology`; color/filter by type; analytics
  overlays (pagerank, wcc, …) behind the F3.4 confirmation, colorizing the
  current canvas.
- Node selection opens the row inspector with properties and cross-primitive
  bindings; reduced-motion honored (N10).

Tests: expansion respects depth/fan-out caps (fake server asserts request
bounds); layout determinism under fixed seed for snapshot testing; overlay
colorization from a recorded pagerank result; a 10k-node fixture stays
responsive under scripted interaction; keyboard-only navigation reaches every
node.

Risk note: this is the largest view. A one-week spike (canvas tech + layout under
theme tokens + virtualization strategy) is scheduled at the *start* of M4,
parallel to E8, so bad news arrives early.

### M5 — Ecosystem

#### E12 — Clone from StrataHub (S)

Covers: F5.1–F5.4.

- Palette + explorer action prompting slug, optional branch, destination, hub URL
  override (CLI resolution order); runs `strata clone` with progress; on success
  offers attach/start-host per AR-3.
- Hub errors mapped by code with registry hints (F5.3); trusted-workspace only,
  disabled with stated reason otherwise (F5.4).

Tests: subprocess wrapper tested against a stub `strata` that scripts each
registry error code and a success; destination-collision handling; untrusted
workspace shows the disabled reason. Live-hub run stays a manual pre-release
checklist item (no hub test tier in V1 CI).

#### E13 — MCP agent registration (M)

Covers: F6.1–F6.5.

- `McpServerDefinitionProvider` contributed on activation; editor-managed consent
  (F6.1).
- File-based writers for `.cursor/mcp.json` and `.mcp.json`: one machine-level
  Always/Never consent, then automatic per-workspace registration; idempotent,
  merge-safe (never clobbers foreign entries), reversible via "Strata: Remove
  agent registrations" (F6.2).
- Workspace-scoped single `strata` entry; pinned primary database as the
  transitional shape, named entries for multi-database workspaces (F6.3).
- Entries use the resolved machine-scoped binary path; trusted-workspace only
  (F6.4).
- F6.5 falls out of AR-3.5 — add an integration test, not new UI.

Tests: writer idempotence (run twice → byte-identical); merge safety (existing
foreign servers preserved; malformed existing JSON → refuse and report, never
overwrite); removal restores the pre-registration file exactly; consent state
machine (Always/Never/undecided) unit-tested; untrusted → disabled with reason.
Integration: register, run `strata mcp serve` against the workspace database,
assert the agent session appears in `ipc_status.clients` and its writes tick the
subscriber — the M5 exit demo, automated.

### M6 — Ship

#### E14 — Hardening, accessibility, release engineering (M)

Covers: N1, N4, N6, N9, N10, AR-7.2 (walkthrough polish), V1 exit.

- Perf pass against N1 budgets; log-redaction audit (N4 — row contents never
  logged by default; grep-based CI check for value fields in log calls).
- Accessibility audit against N10: labels, keyboard paths, reduced motion,
  codicon-per-primitive (never color alone).
- Walkthrough content finalized; README with supported `strata` range (Q3
  decision lands here); CHANGELOG; marketplace assets.
- `vsce` packaging in CI; publish pipeline to Marketplace **and** Open VSX (Q5
  draft assumption); a packaged-`.vsix` install smoke on both platforms.
- Full-demo script (the M2–M5 exit demos, end to end) executed on a clean machine
  as the release gate.

Done when: V1 exit criteria hold — all F1–F6 demos pass from a marketplace
install, every N-requirement has an owner-signed audit note, and the exclusion
ledger from E1 contains only §2's out-of-scope commands.

---

## 4. Test plan

### 4.1 Layers

| Layer | Runner | Feeds on | Guards |
|---|---|---|---|
| Unit | vitest | fixtures, fakes | codec, state machines, generators, writers, view models |
| Fake-server | vitest + transcript replayer | recorded transcripts | UI logic, error rendering, pagination discipline — no live host needed |
| Cross-process integration | vitest + E3 harness | real `strata start` on durable temp DBs | the N7 scenario list; every epic adds scenarios |
| Extension-host | `@vscode/test-electron` | real host + real VS Code | activation, attach, tree, one view, console round-trip — kept deliberately small |
| Packaging smoke | CI job | built `.vsix` | installs and activates on macOS + Linux |

### 4.2 The N7 scenario ledger

The requirements name six wire behaviors CI must exercise; each is owned by an
epic and stays in CI forever after:

| Scenario | Landed by | Mechanism |
|---|---|---|
| hello / version skew | E2 | mismatched-stamp hello against real host |
| read gate (client-bug detector) | E2 | raw-socket write on a read session → typed refusal; client gate refuses to send |
| tick-driven refresh | E2 (wire), E5 (UX) | CLI write → tick → debounced visible refresh |
| deadline shed | E2 | busy lane + tiny `deadline_ms` → `ipc_deadline`, `not_started` |
| capacity refusal | E2 | saturate 128 connections → typed refusal, backoff |
| owner-death recovery | E2 (wire), E4 (states) | kill host → transport error → rediscover → reattach → re-read |

### 4.3 Fixtures

- **Request corpus:** the vendored IDL `examples/` directory drives console-form
  and serialization tests across all 82 read commands — coverage is a
  regeneration guard, not a hand-kept list.
- **Transcripts:** recorded by the E3 harness, committed, replayed by the fake
  server. Any wire-shape change shows up as a transcript diff in review.
- **Seeded histories:** scripted multi-version / multi-branch / event-chain
  builders in the harness, so time-travel and feed tests assert exact values.

### 4.4 CI matrix

macOS + Linux on every PR: lint → unit → regen-no-diff → coverage guard →
fake-server suite → cross-process suite (binary built from `STRATA_CORE_REV`,
cached by rev) → extension-host smoke → package smoke. The cross-process tier is
the slowest; it shards by scenario and reuses one built binary. A
`STRATA_CORE_REV` bump PR must pass the entire matrix — that *is* the upgrade
test (N9).

### 4.5 Explicitly manual (V1)

Live StrataHub clone against the real hub; webview visual QA across the three
theme kinds; screen-reader walkthrough (VoiceOver on macOS, Orca on Linux) —
each a named checklist item in the release gate, not automated in V1.

---

## 5. Sequencing & parallelism

```
M0 ── M1 ──┬── E4 ──┬── (M2 exit)
           │        │
           └── E5 ──┘
                     ├── E6 ─┬─ (M3 exit)      E8 spike + E11 spike start
                     └── E7 ─┘                 in parallel with M3
                                ├── E8 ── E9 / E10 / E11 ─ (M4 exit)
                                └── E12 / E13 ──────────── (M5, anytime after M2)
                                                 └── E14 ─ (M6)
```

- M0 → M1 is strictly serial: everything imports the generated catalog, then the
  client.
- After M1, two engineers can split cleanly: one on E4/E5 (M2), one starting E7
  (console is pure catalog + client) or the E8/E11 spikes.
- E12 and E13 depend only on M2-level infrastructure (binary resolution, trust
  gating, status bar) and can land any time after it — they are good
  schedule-absorbers if M4 runs long.
- The single hard risk-retirement item is the E11 graph spike — scheduled at the
  start of M4, not the end.

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Graph canvas (E11) blows its budget | M4 slips | Week-1 spike; neighborhood-only scope is fixed; analytics overlays and ontology filters are severable into a point release |
| Single execution lane makes the UI feel slow under agent load | Demo quality | Already designed for (deadlines, shed UX, guest discipline); add a busy-lane perf test to the harness so regressions are visible |
| `McpServerDefinitionProvider` floor excludes older VS Code / forks | F6.1 reach | Verify API floor at E0; file-based path (F6.2) is the fallback that works everywhere |
| Upstream `strata-core` moves while we build | Rework | `STRATA_CORE_REV` discipline; bumps are deliberate PRs through the full matrix; `deny_unknown_fields` keeps us honest |
| CI binary build time (no release train yet) | Slow PRs | Cache by rev hash; binary rebuilds only on pin bumps; swap to release downloads when the train exists |
| Vector scatter stretch creeps into the critical path | M4 slips | Feature-flagged, first thing cut (already stated in F4.4) |
| strata-mcp workspace discovery lands late | F6.3 stays transitional | Pinned-entry shape ships in V1 regardless; discovery is an upstream follow-up, not a V1 dependency |

---

## 7. Decisions to confirm at kickoff

1. **Pin `STRATA_CORE_REV = 2556b6be`** (current tip, slices A–C verified). —
   proposed yes.
2. **`engines.vscode` floor** — verify the `McpServerDefinitionProvider` stable
   release and pin to it.
3. **Q3 (minimum supported `strata`)** — plan assumes: enforce `release ≥ 1.0.0`
   at the hello, best-effort degrade per AR-6 below it. Must be final by E14
   (README statement).
4. **Team size** — the parallelism plan in §5 assumes one engineer serially
   through M0–M1, then up to two in parallel; confirm so milestone review dates
   can be set.

---

## Appendix — Requirement traceability

| Requirement | Epic(s) |
|---|---|
| AR-1 (IDL) | E1 |
| AR-2 (wire client) | E2 |
| AR-3 (attach/host) | E4 |
| AR-4 (read-only) | E2 (gate), E5 (surface), E7 (console UX) |
| AR-5 (liveness) | E2 (transport), E5 (refresh UX) |
| AR-6 (skew) | E1 (types), E2 (hello compare) |
| AR-7 (VS Code contract) | E0 (manifest), E4 (trust behavior), E8 (tabs), E14 (walkthrough) |
| AR-8 (lifecycle) | E2 (reconnect), E4 (host lifetime, persistence) |
| F1 (explorer) | E4 (states), E5 (tree) |
| F2 (time travel) | E6 |
| F3 (console) | E7 |
| F4 (views) | E8–E11 |
| F5 (hub clone) | E12 |
| F6 (MCP) | E13 |
| N1, N2 | E2, E5, E14 (perf gate) |
| N3 | E2 |
| N4 | E2 (redaction), E8 (asset locality), E14 (audit) |
| N5, N6 | E0, E14 |
| N7 | E3 (harness), every epic (scenarios) |
| N8 | E8 |
| N9 | E1 (pin discipline), E3 (CI shape), E14 (publish) |
| N10 | E8 (base), E11 (canvas), E14 (audit) |
