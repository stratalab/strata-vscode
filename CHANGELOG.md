# Changelog

## Unreleased

- M1 wire: native protocol-revision-2 client (frames, hello/skew, correlated
  single-in-flight requests with per-class deadlines, typed error taxonomy,
  client-side write gate, version-tick subscriber with debounce and
  bounded-backoff reconnect) and the N7 cross-process harness (real
  `strata start` owners, raw sessions, transcript recorder) with the six
  wire scenarios in CI.
- M0 foundations: extension scaffold, vendored IDL v1 toolchain
  (`STRATA_CORE_REV`-pinned), generated command catalog / error registry /
  wire types, coverage guard, CI on macOS + Linux.
