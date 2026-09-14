# Changelog

## Unreleased — Strata 1.2.2 adoption

- Vendored and regenerated against `strata-core` 1.2.2 IDL, including the
  `kv` branch-diff capability shape.
- KV browsing now uses engine-backed prefix, cursor, limit, and as-of paging
  instead of loading large keyspaces before filtering.
- Object-browser search states now distinguish database prefix search from
  local filtering over loaded rows.
- CLI execution paths share one structured JSON envelope parser; extension
  control paths no longer depend on human CLI output.
- Command-console results now open as structured Markdown reports for pages,
  write receipts, object records, branch diffs, scalar values, and structured
  errors, with raw JSON kept as an explicit secondary section.
- Strata Status now reports 1.2.2 capability readiness: engine floor, Hub
  browse commands, clone progress, KV prefix paging, wall-clock commit support,
  machine output contract, Hub URL, MCP registration, and IDL pin.
- Added coverage for IDL regeneration, command contributions, branch diff
  `kv` output, KV prefix paging, clone progress, and Status Center capability
  readiness.

## 0.1.0 — 2026-08-05

Initial release: the V1 observer surface, built against `strata-core`
executor IDL v1 and IPC protocol revision 2.

- **Live database explorer** — attach-first discovery with a closed set of
  teaching states (attachable / unowned / owned-unreachable / at-capacity /
  version-mismatch / pre-V1 / not-a-database), managed `strata start` hosts
  with orphan re-adoption, tick-driven refresh with zero polling, capped
  pages with explicit load-more, row inspector with copy-as-wire-JSON and
  copy-as-CLI.
- **Branches & time travel** — persisted branch selection, an `as_of`
  scrubber driven by per-key/document history timelines, retention limits as
  teaching states, cross-branch comparison in the native diff editor.
- **Command console** — the full non-inference catalog (71 runnable reads,
  45 greyed writes), schema-generated forms, raw wire-JSON with pre-send
  validation, expensive-command confirmations, full error envelopes with
  docs links, replayable history.
- **Primitive views** — strict-CSP webviews styled with editor theme tokens:
  KV table, JSON browser with structural diff, live event feed with chain
  verification, vector browser (floats summarized, never dumped), graph
  canvas with bounded neighborhood expansion and pagerank/wcc overlays.
- **Clone from StrataHub** — `strata clone` with progress and registry-coded
  errors with hints.
- **Agent enablement** — native MCP provider plus consent-gated, idempotent,
  reversible registration for Cursor and Claude Code.
- **Security posture** — server-enforced read-only sessions, attach-only in
  untrusted workspaces, machine-scoped binary path, no telemetry, no network
  access from webviews, logs redact values.

Supported engine: `strata` ≥ 1.0.0 (IDL `strata.idl.v1`, IPC protocol 2),
macOS and Linux.
