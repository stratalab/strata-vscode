# StrataDB for VS Code

A live, **read-only** window on [Strata](https://stratadb.org) databases inside
the editor: open the folder containing a database, watch your app or agent's
state change as it works, scrub back in time, and inspect any row on any
branch — without ever contending with the app that owns the database.

## What it does

- **Live explorer** — databases → branches → spaces → primitives → entries,
  with counts, capped pages, and explicit *Load more*. Refresh is push-driven
  (version-tick subscriptions); the extension never polls.
- **Primitive views** — each primitive opens into a view shaped like its data:
  a KV table with text/JSON/hex value forms, a JSON document browser with
  copyable paths and a two-version structural diff, a live event feed with
  chain verification, a metadata-first vector browser, and a graph canvas
  built by bounded neighborhood expansion.
- **Branches & time travel** — a branch picker per database, per-key history
  timelines, and an `as_of` scrubber: pick a version from any timeline and the
  whole database view moves to that moment. Cross-branch comparison opens in
  the native diff editor.
- **Command console** — every read-class command in the executor IDL, runnable
  from schema-generated forms or raw wire JSON with pre-send validation.
  Write commands are visible but greyed: V1 is an observer surface.
- **Clone from StrataHub** — `Strata: Clone Dataset from StrataHub…` pulls a
  hub dataset into a new local database and opens it.
- **Agent enablement** — one consent, and Strata registers itself with your
  AI agents (VS Code agent mode natively; Cursor and Claude Code via
  `.cursor/mcp.json` / `.mcp.json`). Watch the agent's session appear in the
  status bar and its writes stream into the views.

## How it attaches

Strata admits one read-write owner per database. This extension is always a
**socket client** of that owner — it introduces itself with a hello, declares
a read-only session the owner *enforces*, and subscribes to change ticks. It
never embeds the engine and never takes the writer lock. If nothing owns a
database, the explorer offers **Start Database Host** (`strata start`), which
keeps the database attachable by every other process too.

## Requirements

- **strata** ≥ 1.0.0 on `PATH` or at the `strata.binaryPath` setting —
  needed only to start hosts, run doctor, clone, and serve MCP. Attaching to
  an already-running owner needs no binary at all.
- macOS or Linux. The transport is a local Unix socket, so in remote
  development (SSH/WSL/devcontainers) the extension runs where the database
  lives (`extensionKind: workspace`). Windows support is blocked on the
  upstream transport.
- Version skew is detected at attach via the wire handshake; an owner built
  against a different IDL revision degrades gracefully (unknown commands are
  hidden) rather than failing.

## Trust & privacy

- In **untrusted workspaces** the extension is attach-only: it will connect
  to an existing socket but never executes the `strata` binary (no host
  start, no doctor, no clone, no agent registration). `strata.binaryPath` is
  machine-scoped and never read from workspace settings.
- Row contents never leave the machine; logs redact values by default; the
  webviews are strict-CSP with zero network access. **No telemetry.**

## Settings

| Setting | Purpose |
|---|---|
| `strata.binaryPath` | Path to the strata CLI (machine-scoped) |
| `strata.databases` | Explicit database paths beyond workspace discovery |

## Development

```sh
npm install
npm run generate      # regenerate src/generated from the vendored IDL
npm run test:unit     # fast suite (fake owner)
npm run test:integration  # cross-process suite (needs a strata binary)
npm run build         # bundle extension + webviews
npm run package       # produce the .vsix
```

The IDL artifacts in `idl/v1` are vendored from `strata-core` at the revision
pinned in `idl/v1/STRATA_CORE_REV`. A pin bump is a PR that re-vendors,
regenerates, and passes the coverage guard — never a silent update. CI
enforces regeneration no-diff and that every catalog command is either
surfaced or in the shrink-only ledger under `coverage/`.

The CI integration tier builds `strata` from the pinned rev; it needs the
`STRATAHUB_TOKEN` secret (a fine-grained PAT with read access to
`stratalab/stratahub`) because strata-core git-pins that private repo. The
built binary is cached per OS + pin.

Releases: tag `v*` → the release workflow packages the extension and, when
`VSCE_PAT` / `OVSX_PAT` secrets are configured, publishes to the VS Code
Marketplace and Open VSX.
