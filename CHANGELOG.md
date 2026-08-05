# Changelog

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
