# Strata 1.2.2 Extension Adoption Plan

Status: implemented on `feat/strata-1.2.2-adoption`
Last updated: 2026-09-14
Primary repos: `strata-vscode`, `strata-core`, `stratahub`

## Purpose

`strata-core v1.2.2` improves the CLI and wire surfaces that the VS Code
extension depends on. The extension should adopt those fixes deliberately rather
than treating the release as a binary-version bump.

The goal is to make the extension:

- use the current IDL and command contracts
- rely on machine-readable engine output wherever possible
- move large-object browsing toward engine-backed pagination and prefix search
- report setup status against the capabilities that now exist
- keep user-facing behavior clear while upstream contains/fuzzy search remains
  an open engine capability

## Source Facts

Local environment:

- Installed engine: `strata 1.2.2`
- Release: https://github.com/stratalab/strata-core/releases/tag/v1.2.2

Extension-relevant upstream issues:

| Issue | Status | Extension meaning |
|---|---|---|
| `strata-core#3017` | Open | KV `list` has prefix, cursor, limit, and as-of support. Contains/fuzzy search remains open. |
| `strata-core#3020` | Closed | Hub browse commands are available through core and should remain the preferred trusted path. |
| `strata-core#3021` | Closed | Machine-readable clone progress is available and should stay wired into Hub clone UX. |
| `strata-core#3041` | Open | Hub dataset list still needs parity for query/facet output before the extension can remove direct HTTPS catalog fallback. |
| `strata-core#3112` | Closed | Commit wall-clock timestamps are fixed and included in the installed engine. |
| `strata-core#3116` | Closed | Binary KV/raw-value support is fixed in 1.2.2. |
| `strata-core#3205` | Open | Human CLI output remains an umbrella concern; extension internals should avoid depending on human output. |
| `strata-core#3306` | Closed | No-human-output mode is fixed in 1.2.2. |
| `strata-core#3314` | Open | CLI output-contract work shipped in 1.2.2, with follow-up cleanup and documentation still tracked. |
| `strata-core#3379` | Open | `ComparedCapability` was renamed from `key_value` to `kv`; the extension must account for that during IDL adoption. |

## Product Decisions

1. Use engine-backed prefix search for large KV lists.
2. Keep contains/fuzzy filtering local over the loaded result set until core
   exposes an engine-backed contains/fuzzy query.
3. Label the UX honestly so users can tell the difference between database
   search and filtering the currently loaded rows.
4. Keep extension internals on JSON/wire output, not human CLI text.
5. Treat command-console rendering as a product surface, not as raw CLI dumping.

## Non-Goals

- Do not implement a long-lived TypeScript replacement for core search.
- Do not parse human CLI output for extension logic when JSON or wire output
  exists.
- Do not change `strata-core` from this repository.
- Do not hide upstream capability gaps behind unclear UI.

## Implementation Phases

Implementation ledger:

| Phase | Status | Commit |
|---|---|---|
| Checkpoint current UX work | Complete | `466a687` |
| Adopt the 1.2.2 IDL | Complete | `8ed7bf6` |
| Move KV prefix filtering to the engine | Complete | `11ed140` |
| Tighten object browser search UX | Complete | `2b3ac78` |
| Adopt the 1.2.2 CLI output contract | Complete | `2000b1c` |
| Improve command console results | Complete | `72a3c29` |
| Update Status and Setup Center | Complete | `72a0d7e`, `7fb1950` |
| Test matrix | Complete | `7fb1950` |

### 1. Checkpoint Current UX Work

Commit and push the current VS Code UX polish before starting the engine
adoption branch.

This keeps the release-adoption work isolated from the visual and interaction
changes that are already in the working tree.

### 2. Adopt the 1.2.2 IDL

Update the vendored core revision and regenerate extension bindings from the
1.2.2 IDL.

Expected work:

- update `idl/v1/STRATA_CORE_REV`
- run the repository's vendor/generation flow
- review generated type changes
- address compile fallout
- handle `ComparedCapability` changing from `key_value` to `kv`
- keep compatibility code only where existing databases or older engines need
  a graceful fallback

Validation:

- generated-code check
- typecheck
- unit tests for branch diff capability rendering
- integration tests against the installed `strata 1.2.2`

### 3. Move KV Prefix Filtering to the Engine

The object browser should avoid loading large keyspaces and then filtering them
locally. For KV objects, plain prefix-like searches should be sent to the
engine with cursor and limit support.

Expected behavior:

- empty search loads the first page
- search text resets paging
- `Load more` continues the same query
- as-of browsing keeps the same timestamp across all pages
- local fuzzy filtering is only a refinement over the loaded page
- clearing text restores the unfiltered paged view

Implementation targets:

- `src/ui/viewData.ts`
- `src/views/spaceBrowser.ts`
- unit tests around search state, paging state, and fallback filtering
- integration tests for prefix, cursor, limit, and as-of behavior

### 4. Tighten Object Browser Search UX

Search states should explain what happened without documentation text in the
main workflow.

Required states:

- no objects in this space
- no prefix matches in the database
- no fuzzy matches in loaded rows
- more matching rows are available
- search is running
- search failed with a recoverable engine error

The result counter should distinguish loaded rows from database matches when
the engine exposes that distinction. Until then, use wording that does not imply
a full-database count.

### 5. Adopt the 1.2.2 CLI Output Contract

Review all shell-out paths and remove defensive parsing that exists only because
older core versions mixed human and machine output.

Priority surfaces:

- Hub clone progress
- Hub catalog and dataset metadata
- config/status checks
- agent guide and setup commands
- command console command execution

Rule: extension logic should consume structured JSON or wire responses. Human
text can be displayed to users, but it should not be a control-plane contract.

### 6. Improve Command Console Results

The command console should not feel like raw CLI output pasted into a webview.
It should render common structured responses as useful UI and keep raw JSON as
an explicit secondary view.

Target renderers:

- write receipts
- table-like list results
- object records
- branch/diff summaries
- structured errors with suggested fixes

This can land after the core 1.2.2 adoption if it would otherwise slow the
compatibility work.

### 7. Update Status and Setup Center

The Status Center should recognize 1.2.2-era capabilities directly.

Checks to add or update:

- engine version is at least `1.2.2`
- Hub browse commands available
- clone progress mode available
- KV prefix/cursor/list support available
- commit wall-clock timestamps available
- no-human-output mode available
- MCP registration status still valid
- configured Hub URL source visible

The panel should show suggested fixes only when action is actually needed.

### 8. Test Matrix

Required automated coverage:

- IDL regeneration is clean
- manifest command contributions still match expected menus
- branch diff handles `kv` capability output
- object browser prefix filtering resets and preserves paging correctly
- local fuzzy filtering remains scoped to loaded rows
- Hub clone progress still emits visible progress and post-clone actions
- Status Center reflects the installed engine capability set

Validation commands run on the completed branch:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run guard
npm run build
npm run package
```

Coverage locations:

| Requirement | Coverage |
|---|---|
| IDL regeneration is clean | `npm run package` prepublish runs `npm run generate -- --check`; `test/unit/stamps.test.ts` checks vendored stamps |
| Manifest command contributions still match expected menus | `test/unit/manifest.test.ts` |
| Branch diff handles `kv` capability output | `test/unit/branchRender.test.ts` |
| Object browser prefix filtering resets and preserves paging correctly | `test/unit/viewData.test.ts`, `test/unit/viewLogic.test.ts` |
| Local fuzzy filtering remains scoped to loaded rows | `test/unit/viewLogic.test.ts` |
| Hub clone progress still emits visible progress and post-clone actions | `test/unit/clone.test.ts`, `test/unit/hubCliCatalog.test.ts` |
| Status Center reflects the installed engine capability set | `test/unit/statusCapabilities.test.ts` |

Manual verification:

- connect an existing database
- create a new database
- browse a large KV space
- search a known prefix
- clear search
- load additional pages
- browse as-of data
- fork a branch and compare it
- clone from StrataHub and open the cloned database
- register agent/MCP setup from the AI panel

## Open Follow-Ups

- Track `strata-core#3017` for true contains/fuzzy search.
- Track `strata-core#3041` before removing direct HTTPS Hub catalog fallback.
- Track `strata-core#3314` for any remaining output-contract cleanup.
- Track `strata-core#3379` and update the extension once the capability rename
  is documented or finalized.
