# Changelog

## Unreleased

- M4 primitive views: strict-CSP webview infrastructure with a typed
  extension↔view protocol and theme-token styling; KV table (sort/filter,
  text/JSON/hex value forms, history timeline that drives the scrubber);
  JSON browser (collapsible tree with copyable paths, read-only indexes,
  two-version structural diff); live event feed (backward paging from the
  head, type filter, tick-driven append, inline chain verification); vector
  collection browser (metadata-first, floats summarized as dims+norm);
  graph canvas (bounded neighborhood expansion, deterministic force layout,
  ontology sidebar with type filters, pagerank/wcc overlays behind the
  expensive-command confirmation). Clicking a primitive in the explorer
  opens its view. The vector scatter stretch goal was cut as flagged.

- M3 time travel & console: per-database branch picker (persisted) and
  as_of scrubber (session-only) with tick refresh suspended while scrubbed;
  per-key/document history timelines that drive the scrubber;
  `history_unavailable` as a retention teaching state; cross-branch
  side-by-side comparison via the native diff editor; and the command
  console — searchable palette over the full non-inference catalog (71
  runnable reads, 45 greyed writes), schema-generated quick-input forms,
  raw wire-JSON mode with pre-send validation, expensive-command
  confirmation, full error-envelope rendering with docs links, cursor
  continuation, and replayable history. Coverage ledger: 0 pending.

- M2 first light: database discovery and the closed attachment-state set
  (attachable / unowned / owned-unreachable / at-capacity / version-mismatch
  / pre-V1 / not-a-database), managed `strata start` hosts with orphan
  re-adoption, the live explorer tree (databases → branches → spaces →
  primitives → entries) with capped pages and explicit load-more, row
  inspector with copy-as-wire-JSON / copy-as-CLI, `ipc_status` status bar,
  tick-driven refresh with visibility pause, and the getting-started
  walkthrough. 13 commands surfaced from the coverage ledger.

- M1 wire: native protocol-revision-2 client (frames, hello/skew, correlated
  single-in-flight requests with per-class deadlines, typed error taxonomy,
  client-side write gate, version-tick subscriber with debounce and
  bounded-backoff reconnect) and the N7 cross-process harness (real
  `strata start` owners, raw sessions, transcript recorder) with the six
  wire scenarios in CI.
- M0 foundations: extension scaffold, vendored IDL v1 toolchain
  (`STRATA_CORE_REV`-pinned), generated command catalog / error registry /
  wire types, coverage guard, CI on macOS + Linux.
