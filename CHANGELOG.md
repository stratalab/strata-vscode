# Changelog

## Unreleased

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
