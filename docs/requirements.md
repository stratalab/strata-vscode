# StrataDB for VS Code — V1 Requirements

**Status:** Draft for review
**Date:** 2026-08-04
**Repo:** `stratalab/strata-vscode`
**Upstream contract:** `strata-core` executor IDL v1 + executor IPC transport

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
2. **The extension reaches databases over executor IPC.** It attaches as a socket
   client to the process that owns the database, so multiple readers (the extension,
   a terminal CLI, the app itself) can access one database concurrently. The extension
   never embeds the engine and never takes the storage writer lock in-process.

V1 is strictly **read-only**: an observer surface. Writes (including branch creation)
are deferred to a later version.

---

## 2. Product scope

### In scope (V1)

| # | Feature | One-liner |
|---|---------|-----------|
| F1 | Live database explorer | Tree of databases → branches → spaces → primitives; browse and inspect rows while another process writes |
| F2 | Branches + time travel | Branch picker, branch inspection, side-by-side branch comparison, and a time-travel scrubber (`as_of`) over reads and history |
| F3 | Command console | Run read-class IDL commands against the database from a panel; typed forms from JSON Schemas plus a raw wire-JSON mode |

### Out of scope (V1)

- **All writes** — KV/JSON/event/vector/graph mutation, branch create/fork/delete,
  space create/delete, `arrow.import`, `ipc_stop`. Write UX is a later version, ideally
  landing after server-side read-only handles exist (see §7).
- **Search & retrieval panel** — deferred; revisit once the console proves the interaction model.
- **Inference/generation UI** — the `inference` family is not surfaced.
- **Windows** — the executor IPC transport is Unix-only today (see §7).
- **StrataHub browsing**, remote databases, fleet views.
- **Any query DSL** — the console speaks IDL commands and wire JSON, per the no-DSL principle.

---

## 3. System context

### 3.1 The ownership model (as implemented in strata-core)

Storage admits exactly **one read-write process per database** — the first opener takes
the `locks/writer` flock. The executor's IPC layer (`crates/executor/src/ipc/`) makes
multi-process access a *transport* concern: the owning process may host a Unix domain
socket at `<data_dir>/strata.sock`, and every other process transparently becomes a
client of the owner. There is no daemon and no server product; hosting is a side effect
of opening the database with `IpcMode::Host`.

Consequences the extension is designed around:

- **Concurrent access, serialized execution.** All requests — every client's plus the
  owner's own — execute through a single lane (`Arc<Mutex<Executor>>`, audit finding
  NODE-11). Multiple readers work; they do not run in parallel. A long command
  head-of-line-blocks everyone.
- **No read-only handles.** `AccessMode` from the IPC contract doc is unimplemented;
  every socket client is fully read-write. Read-only must be enforced client-side (AR-4).
- **No handshake.** The wire has no protocol version, capability negotiation, or
  authentication (filesystem `0600` socket, same Unix user only). Skew detection is the
  consumer's job (AR-6).
- **No subscriptions.** The wire is strict request/response; liveness is polling (AR-5).

### 3.2 Which processes can the extension attach to today

| Owner process | Hosts a socket? | Extension can attach? |
|---|---|---|
| `strata start <db>` | Yes (`Host`, forced) | Yes — the canonical companion |
| `strata` REPL (interactive TTY) | Yes (`Host` default) | Yes |
| `strata mcp serve` | Yes (`Host` default) | Yes — a Claude-driven agent session is observable live |
| One-shot `strata` command | No (`Client`, brief lock) | n/a (transient) |
| App embedding `stratadb` (Rust facade) | **No** — facade re-exports engine only, no executor/IPC | **No** |
| App on `strata-python` | **No** — builds executor with `default-features = false`, omitting `ipc` | **No** (see D6, §7) |
| App on `strata-nodesdk` | **No** — binds the embedded `stratadb` facade, pre-IDL | **No** (see D7, §7) |
| Unowned database (no process) | — | Extension starts a managed host (AR-3) |

The headline scenario — *watch your app's database live* — therefore works today when
the app side is driven through the CLI/MCP surface or when the extension itself hosts,
and it reaches full strength once the SDK asks in §7 land.

---

## 4. Architecture requirements

### AR-1 — IDL consumption

- **AR-1.1** Vendor the `idl/v1` directory from `strata-core`, pinned by a
  `STRATA_CORE_REV` file, mirroring the established `strata-python` pattern
  (`idl/v1/` + `tools/generate.py`). The release tarball
  (`strata-idl-docs.tar.gz`, attached to strata-core releases with sha256 checksums)
  is the acceptable alternative source for the same artifacts.
- **AR-1.2** A build-time generator (`tools/generate.ts` or equivalent) emits from
  `generated/command-index.json` + `generated/schemas/*.json` + `errors.yaml`:
  TypeScript types for all commands and outputs, the command catalog (id, title,
  summary, kind, access, pagination, `cli_surface`, `path_display`), and the error
  registry (code, class, `retry_policy`, `commit_outcome`, hint).
- **AR-1.3** Generated code is committed and CI-guarded: regenerating against the pinned
  rev must produce no diff (the freshness check every strata-core surface has), and a
  coverage guard fails if a catalog command is neither surfaced nor explicitly listed
  in a shrink-only exclusion ledger — the extension's analog of `catalog_guard.rs`.
- **AR-1.4** Validate all four IDL version stamps on generation
  (`strata.idl.v1` / `strata-executor-idl.1` and, if the CLI projection is consumed,
  `strata.cli.v1` / `strata-executor-cli-idl.1` plus the source checksum).
- **AR-1.5** The IDL `access` facet (82 read / 45 write commands today) is the sole
  source of read/write classification (feeds AR-4). The `kind` taxonomy drives console
  UX (pagination style, "expensive" marking for `read.search`/analytics kinds).
- **AR-1.6** The console reaches commands by **wire type**, not CLI verb paths — 19
  commands are `cli_surface: wire` and have no CLI verb; a verb-driven palette would
  silently miss them.

### AR-2 — IPC transport client

- **AR-2.1** A native TypeScript client speaks the socket protocol directly: Unix
  domain socket, 4-byte big-endian length-prefixed frames, 64 MiB frame cap, JSON
  payloads. Request envelope `{branch?, space?, command}`; responses are the standard
  `{"type": …, "data": …}` / `{"error": {class, code, …}}` envelopes. No subprocess
  per request on any interactive path.
- **AR-2.2** Socket discovery replicates the executor's rules: `<data_dir>/strata.sock`,
  falling back to the `<data_dir>/strata.sock.path` pointer file (long-path overflow),
  with `<data_dir>/strata.pid` for owner identification and staleness checks.
- **AR-2.3** The protocol has no correlation IDs: **strictly one in-flight request per
  connection**, queued client-side. The extension uses a small fixed pool — one
  connection for interactive requests, one for background polling — and never more
  than 4 (the server caps at 128 connections total and *drops* excess; be a good citizen).
- **AR-2.4** Every request carries an explicit `branch` (and `space` where applicable).
  Scope is fully request-determined on the server; the extension never relies on
  session stickiness.
- **AR-2.5** Client-side timeout budgets per request class (fast reads vs. paged scans),
  with the explicit failure story for the no-server-timeout gap: a timed-out request
  may still be running on the owner; surface "still executing on the database owner —
  results discarded" rather than a generic error, and do not auto-retry.
- **AR-2.6** Handle the registered transport errors by code, never message text:
  `invalid_argument.executor.wire_request`, `unavailable.executor.ipc_transport`
  (owner died — reconnect/rediscover), `internal.executor.wire_response`,
  `unavailable.engine.persistence` (lock held, no socket), and
  `invalid_argument.executor.json_number` (integer precision guard).

### AR-3 — Attach and host model

- **AR-3.1** **Attach first.** If a live socket exists, connect as a pure client.
  The extension never takes the writer lock in-process (it has no engine).
- **AR-3.2** If the database is unowned, offer **"Start database host"**: spawn a
  managed `strata start <db>` child process. This keeps the database attachable by
  every other reader (terminal, agents) rather than locking it into the extension.
  The child's lifecycle is tied to the workspace session, with explicit stop via
  `strata stop` semantics; readiness is parsed from the `ipc_started` JSON line.
- **AR-3.3** The `strata` binary is discovered via user setting, then `PATH`. The
  extension does not bundle the binary in V1. Missing binary degrades to a clear
  setup prompt, not a broken tree.
- **AR-3.4** Database discovery: workspace scan for Strata data directories (layout
  markers, e.g. `strata.pid`/`locks/`/manifest presence) plus explicit
  user-configured paths. Cache-mode databases (no socket, no lock, by design) are
  out of reach and reported as such.
- **AR-3.5** Status bar surfaces the attachment state per database — owner PID, hosting
  process kind, client count — from `admin.ipc_status`, and reflects owner
  death/handoff within one polling interval.

### AR-4 — Read-only enforcement (client-side)

- **AR-4.1** All requests pass through a single transport-layer gate that rejects any
  command whose IDL `access` is not `read`, before serialization. The allowlist is
  generated at build time (AR-1.5), never hand-maintained.
- **AR-4.2** The console shows write commands greyed-out with the reason ("StrataDB
  for VS Code v1 is read-only") rather than hiding them — discoverability without
  capability.
- **AR-4.3** The gate is defense-in-depth, not a security boundary (the socket accepts
  writes from any same-user process), and the requirement flips to server-side
  enforcement the moment read-only handles land upstream (D1, §7).

### AR-5 — Liveness by polling

- **AR-5.1** Background poller on a dedicated connection tracks a cheap version/status
  read per attached database; visible views refresh only when the observed version
  advances. Default interval 1–2 s, configurable; exponential backoff when the
  database is idle; paused entirely when no Strata view is visible.
- **AR-5.2** Respect the single execution lane: polling requests must be the cheapest
  available status commands, and the poller yields (skips a tick) whenever an
  interactive request is queued.
- **AR-5.3** No event subscription exists on the wire; if upstream grows a
  change-notification surface (D4, §7), the poller is replaced, not augmented.

### AR-6 — Version skew

- **AR-6.1** On attach, fetch `strata agents commands --json` (or `admin.describe`)
  from the owner and compare against the vendored catalog's stamps. On mismatch:
  degrade — hide commands the owner doesn't know, warn once, never hard-fail the
  whole surface.
- **AR-6.2** All request DTOs are `deny_unknown_fields` upstream and the schemas set
  `additionalProperties: false`: the extension must never send fields outside the
  vendored schema, and must tolerate unknown fields in responses on display-only paths.

---

## 5. Functional requirements

### F1 — Live database explorer

- **F1.1** Tree: workspace databases → branches → spaces → primitives
  (kv / json / events / vectors / graph) → entries. Counts via the `*.count`
  commands; entries via cursor-paginated `list`/`scan` (21 cursor-paged commands
  upstream), never unbounded reads.
- **F1.2** Row inspection panel: JSON documents pretty-printed, KV values with
  bytes rendered from base64, event payloads with chain position, vector entries
  with dimensions/metadata (not full float dumps by default), graph nodes/edges
  with adjacency navigation.
- **F1.3** Every inspected item offers "Copy as wire JSON" and "Copy as CLI command"
  (from the catalog's `path_display`).
- **F1.4** Live refresh per AR-5: visible tree levels and open inspectors update when
  the database version advances.
- **F1.5** Pagination discipline: page sizes capped (default 100, max 1 000);
  "load more" is always explicit. Nothing the explorer issues may exceed the 64 MiB
  frame cap or hold the execution lane for a perceptible interval.

### F2 — Branches and time travel

- **F2.1** Branch picker scoped per database (`branch.list`, `branch.get`); the
  explorer tree and console operate in the context of the selected branch (AR-2.4).
- **F2.2** Time-travel scrubber: a version/timestamp control that sets `as_of` on
  every read the active view issues (33 read sites accept `as_of` upstream).
  The UI states clearly when it is showing historical state.
- **F2.3** History views for versioned primitives via `kv.history`, `json.history`,
  `vector.history` — a per-key/document timeline that drives the scrubber.
- **F2.4** Branch comparison: side-by-side read of the same key/document/subtree on
  two branches (client-side diff of two reads — no engine diff surface exists).
  Cross-branch references are impossible upstream; the comparison is purely visual.
- **F2.5** Handle `history_unavailable.*` and unretained-version errors as first-class
  UI states ("this version is no longer retained"), not error toasts.

### F3 — Command console

- **F3.1** Command palette over the read-class catalog (82 commands today), grouped by
  family, searchable by id, title, and summary — all from vendored IDL prose.
- **F3.2** Two input modes: a form generated from the command's JSON Schema, and a raw
  wire-JSON editor with schema validation (`$id`-addressable vendored schemas) before send.
- **F3.3** Results rendered by response shape (`result` model from the catalog):
  tables for pages, inspectors for single values, with cursor continuation for paged
  results. Every result offers "Copy as wire JSON".
- **F3.4** Expensive kinds (graph analytics, `read.search`, `arrow.export`) carry an
  explicit confirmation noting they hold the single execution lane (§3.1).
- **F3.5** Error results render the full envelope — class, code, `retry_policy`,
  `commit_outcome`, hint, and the `stratadb.org/e/<code>` link.
- **F3.6** Console history persists per workspace; entries are replayable.

---

## 6. Non-functional requirements

- **N1 — Responsiveness.** The extension host never blocks on IPC; all transport is
  async with the AR-2.5 budgets. Tree expansion targets <150 ms against a local owner
  for one page.
- **N2 — Good-citizen load.** Combined background traffic (polling + prefetch) stays
  under a handful of cheap requests per second per database, and zero when hidden.
  The owner's app workload has priority on the lane; the extension is a guest.
- **N3 — Error discipline.** All error handling keys on `class` + `code`, never
  display text (matching the strata-core testing standard). Unknown codes degrade to
  the class-level behavior.
- **N4 — Security & privacy.** Same-user socket only; no credentials exist to manage.
  Row contents never leave the machine, and logs/diagnostics redact values by default
  (keys/ids ok, payloads opt-in) — matching the upstream redaction default.
- **N5 — Platforms.** macOS and Linux. Windows is blocked upstream (Unix-only IPC
  module; CLI does not compile on Windows) and is explicitly out of scope until D5 (§7).
- **N6 — Packaging.** Publisher `stratalab`, extension id `strata-vscode`, marketplace
  name "StrataDB". No telemetry in V1.
- **N7 — Testing.** The IDL toolchain gives the test spine: generated fixtures replay
  against a real `strata start` owner in CI (Linux + macOS), covering attach, poll,
  read-gate rejection of all 45 write commands, owner-death recovery, and skew
  degradation. UI logic is tested against recorded wire transcripts.

---

## 7. Dependencies and asks on strata-core and sibling repos

Ordered by how much they gate this extension. None block starting V1; D1–D3 shape how
good V1 can be.

- **D1 — Read-only client handles** (`AccessMode` from the IPC contract; M10TB names
  read-only clients but nothing is implemented). Until then AR-4 is client-side only.
- **D2 — Parallel read execution** (audit NODE-11: everything serializes through
  `Arc<Mutex<Executor>>`). Until then N2's guest discipline is the mitigation.
- **D3 — Protocol/capability handshake** on the IPC wire (contract Open Question #1).
  Until then AR-6 skew handling is heuristic.
- **D4 — Change notification** (any watch/subscribe surface). Until then AR-5 polls.
- **D5 — Windows transport** (named pipes; contract Open Question #3, plus CLI
  `cfg`-gating). Gates N5 expansion.
- **D6 — `strata-python` IPC participation**: add `ipc` to its executor feature list so
  Python-hosted apps broker and can host. Without it, Python apps are unreachable (§3.2).
- **D7 — `strata-nodesdk` executor cutover**: the Node SDK still binds the embedded
  facade; moving it to the executor wire + IDL (the planned pattern) makes Node apps
  attachable and gives this extension a potential shared TypeScript core.
- **D8 — Published IDL artifacts**: the release tarball suffices; the planned
  stratadb.org `/idl/v1/` mirror would remove the release-fetch step.

---

## 8. Open questions

- **Q1** Should "Start database host" (AR-3.2) be automatic on first browse of an
  unowned database, or always an explicit user action? (Draft assumes explicit.)
- **Q2** Does the extension ship its own generated TypeScript wire core, or wait and
  share one with a cut-over `strata-nodesdk` (D7)? (Draft assumes own core now,
  converge later.)
- **Q3** Minimum supported `strata` binary version — V1 GA only, or best-effort against
  pre-GA dev builds?
- **Q4** Is `admin.ipc_status`'s `client_count` sufficient for the status bar, or do we
  ask upstream for client identities (ties into D3)?

---

## 9. References (strata-core, at the pinned rev)

- IDL runbook: `crates/executor/idl/v1/README.md`; overlay strategy:
  `docs/architecture/v1-idl-overlay-strategy.md`
- Generated artifacts: `crates/executor/idl/v1/generated/`
  (`command-index.json`, `cli-command-index.json`, `schemas/*.json`)
- IPC implementation: `crates/executor/src/ipc/` (`mod.rs` header comment is the
  canonical ownership statement; `wire.rs` framing; `protocol.rs` envelope;
  `server.rs` serialization + limits; `connection.rs` broker dance)
- IPC contract (binding decisions; code sections are pre-V1):
  `docs/architecture/engine/ipc-and-command-boundary-contract.md`
- Executor audit (NODE-11 single-lane finding, T1 no-CAS):
  `docs/audit/executor-review-2026-07.md`
- Error registry: `crates/executor/src/error_registry.rs`,
  `crates/executor/idl/v1/errors.yaml`, `docs/errors/registry.md`
- Python SDK vendoring pattern: `stratalab/strata-python` (`idl/v1/STRATA_CORE_REV`,
  `tools/generate.py`)
