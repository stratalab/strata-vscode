# strata-vscode

StrataDB for VS Code — a live, read-only window on Strata databases inside the
editor: explorer, branches and time travel, a command console, primitive-shaped
views, and agent enablement.

- Requirements: [`docs/requirements.md`](docs/requirements.md)
- Implementation & test plan: [`docs/implementation-plan.md`](docs/implementation-plan.md)

## Development

```sh
npm install
npm run generate      # regenerate src/generated from the vendored IDL
npm run test:unit     # vitest suite
npm run build         # bundle dist/extension.js
npm run test:e2e      # activation smoke in a real VS Code host
```

The IDL artifacts in `idl/v1` are vendored from `strata-core` at the revision
pinned in `idl/v1/STRATA_CORE_REV`. To bump the pin (a deliberate PR, never a
silent update):

```sh
npm run vendor -- --rev <sha> [--core ../strata-core]
npm run generate
npm run guard         # coverage ledger must account for every command
```

CI enforces that regeneration produces no diff and that every catalog command
is either surfaced or listed in the shrink-only ledger under `coverage/`.

### Integration tier (cross-process, real `strata` owner)

`npm run test:integration` runs the N7 wire scenarios against a real
`strata start` host. It resolves the binary via `STRATA_BIN`, a sibling
`../strata-core` build, or `PATH`, and self-skips when none is found.

In CI this tier builds `strata` from the pinned rev. strata-core is public,
but it git-pins the **private** `stratalab/stratahub` repo, so the build
needs a repo secret: `gh secret set STRATAHUB_TOKEN` with a fine-grained PAT
that can read `stratalab/stratahub`. Without the secret the tier skips with a
notice (the built binary is cached per OS + pin, so the token is only needed
on pin bumps).
