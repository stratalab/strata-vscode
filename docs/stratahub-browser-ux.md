# StrataHub Browser UX

Status: draft
Last updated: 2026-09-02
Primary repos: `strata-vscode`, `strata-core`, `stratahub`

## Purpose

StrataHub is the public catalog of cloneable Strata databases. Users can clone a
dataset today with:

```sh
strata clone <dataset-name>
```

The VS Code extension should make that flow discoverable. A user should be able
to browse available datasets, inspect a dataset card, choose a destination
folder, clone it, and immediately see the cloned database in the Strata
explorer.

The extension should be the browsing and workflow surface. Core should remain
the source of truth for hub URL resolution and clone orchestration.

## Upstream Tracking Policy

If the extension needs a hub/core capability that does not exist yet, open an
issue against the owning repo before building a long-lived workaround in the
extension. The extension may ship a transitional path when it improves the user
experience immediately, but the doc and code should point at the upstream issue
that will remove the workaround.

Current upstream status from this design pass:

- `stratahub#2`: resolved by `stratahub` PR #3; `GET /v1/datasets` now accepts
  `q` and `include_facets=true`.
- `strata-core#3020`: resolved in `strata-core v1.1.1` and verified with `strata 1.2.1`; Hub browse commands are
  now in the vendored IDL.
- `strata-core#3021`: resolved in `strata-core v1.1.1` and verified with `strata 1.2.1`; `strata clone
  --progress jsonl` is feature-detected by the extension.
- `strata-core#3041`: open; `hub.list_datasets` still needs `q` search and
  facet-count parity before the dataset table can move fully off direct HTTPS.

## What Already Exists

### In `strata-vscode`

The extension currently supports clone-by-name:

- `package.json` contributes `strata.cloneDataset`.
- `src/ui/ecosystemUi.ts` implements `cloneFlow()`.
- `src/hub/clone.ts` wraps `strata clone <dataset> <dest> --json`.
- The command prompts for:
  - dataset slug
  - optional branch
  - destination directory
  - optional hub URL override
- The clone path is trusted-workspace only because it executes the Strata
  binary.
- Errors are mapped through the generated registry docs URLs.

Current limitation: the user must already know the dataset slug. There is no
catalog browser, no dataset detail view, no hub selector, and no preview before
clone.

### In `strata-core`

Core owns clone orchestration:

- `strata clone` dispatches through the executor as `hub_clone`.
- Clone creates a new local database and does not touch the currently connected
  read-only session.
- The executor resolves the hub URL, builds the real hub transport, validates
  dataset and branch names, downloads the manifest and objects, checks engine
  compatibility before object download, imports the bundle, and records remote
  origin metadata.
- The current hub URL resolver uses this precedence:
  1. explicit `--hub <url>`
  2. `STRATA_HUB_URL`
  3. project `.strata/config.toml`
  4. global user config
  5. built-in default `https://hub.stratahub.io`
- `strata --json config show` currently returns the effective hub URL and source,
  for example:

  ```json
  {
    "hub.url": "https://hub.stratahub.io/",
    "source": "built-in default"
  }
  ```

`strata 1.2.1` is now available and the extension vendors the Hub browse
IDL. The extension prefers executor-level `hub.info`, `hub.get_dataset`, and
`hub.list_refs` when a trusted workspace has a compatible binary. The dataset
list remains direct host-side HTTPS for now because `hub.list_datasets` does not
yet expose `q` search or facet-count output; that parity gap is tracked in
`strata-core#3041`.

### In `stratahub`

The `stratahub` repo already defines the public V1 HTTP protocol. The important
browser endpoints are:

- `GET /v1/info`
- `GET /v1/datasets`
- `GET /v1/datasets/{name}`
- `GET /v1/datasets/{name}/refs`
- `GET /v1/yanked`

`GET /v1/datasets` supports offset pagination, limit 1 to 200, and filters:

- `q` full-catalog text search
- repeated `task`
- repeated `tag`
- repeated `primitive`
- `license`
- `size_min_bytes`
- `size_max_bytes`
- `sort=downloads|recent|name|size`
- `include_facets=true` to include counts for primitives, tasks, tags, licenses,
  badges, and fixed size buckets

Dataset summary fields include:

- `name`
- `description`
- `size_bytes`
- `downloads`
- `primitives`
- `tasks`
- `tags`
- `license`
- `default_branch`
- `last_updated`
- optional `badge`

Dataset detail cards add:

- `owner`
- `summary_excerpt`
- `created`
- `manifest_hash`
- `engine_version_required`
- `format_version`
- `capability_registry_version`
- `clone_command`
- `readme`
- `quick_start_snippets`
- `frontmatter_extras`
- optional `sample_preview`
- optional `schema`
- optional `strata_features`
- optional `citation`
- optional `provenance`

Live check against `https://hub.stratahub.io` on 2026-09-02:

- `/v1/info` returned protocol `v1`, implementation `stratahub`, server version
  `0.1.0`.
- `/v1/datasets?limit=5` returned `total: 14`.
- The first page included datasets such as `titanic`, `ab-test-results`,
  `iana-http-reference`, `world-bank-indicators`, and
  `agent-memory-with-experiments`.

## Product Goal

The hub should feel like a native data marketplace inside the Strata extension,
not like a command wrapper.

The first screen should answer:

- What datasets are available?
- Which one is relevant to what I am building?
- What does it contain?
- Can my current Strata binary clone it?
- Where will it land on disk?
- What should I do after clone?

## User Experience

### Entry Points

Add a new command:

```text
Strata: Browse StrataHub Datasets
```

Entry points:

- Command palette.
- Explorer welcome view.
- Explorer title action.
- Empty-state action when no local databases exist.
- Secondary action from the existing `Clone Dataset from StrataHub` flow.

Keep the existing clone-by-name command for power users and scripts.

### Hub Source

Default behavior should use the same effective hub URL the CLI would use.

Recommended implementation:

1. Resolve the Strata binary the same way the extension already does.
2. Run:

   ```sh
   strata --json config show
   ```

3. Read `hub.url` and `source`.
4. Fetch browse endpoints from that URL.

Do not reimplement the resolver in TypeScript. The resolver already lives in
core and is subtle enough to drift.

The UI should show the effective hub in a compact selector:

```text
Hub: hub.stratahub.io (built-in default)
```

Actions:

- `Refresh`
- `Change Hub URL`
- `Use Default Hub`
- `Open Hub Config`

For V1, `Change Hub URL` can be per-session or pass-through to
`strata config set hub.url <url>` after confirmation. Do not build private-hub
accounts, auth, or publishing UI yet.

### Catalog Layout

Use a two-pane browser:

- Left/content pane: searchable, filterable dataset list.
- Right/detail pane: selected dataset card.

At narrow widths, the detail pane becomes a second route or bottom sheet.

The catalog list should be information-dense but attractive:

- Dataset name.
- Description.
- Primitive chips.
- Task chips.
- License.
- Human-readable size.
- Download count.
- Last updated.
- Badge when present.

Primary controls should be left-aligned:

- Search box.
- Primitive filter.
- Task/tag filter.
- Sort segmented control: Popular, Recent, Name, Size.
- Hub selector.

The list should never render all datasets at once. Use server pagination with:

- initial `limit=50`
- `Load more`
- clear count text such as `50 of 140 shown`
- empty states for no matches
- offline/error state with retry

### Search

StrataHub V1 exposes server-side search:

```http
GET /v1/datasets?q=<text>&limit=50&offset=0
```

Search should match:

- dataset name
- description
- tasks
- tags
- primitives
- license
- owner

The extension should hide non-matching rows as the user types, debounce the
server request, and then replace the loaded rows with full-catalog server
results. If a user points the browser at an older/private hub that ignores `q`,
the UI may fall back to local loaded-row filtering and must label count semantics
honestly:

- `Filtered loaded datasets` for local-only filtering.
- `Search results` only when the server searched the full catalog.

Facet chips should prefer `include_facets=true` counts from the server and use
loaded-row facet extraction only as a compatibility fallback.

### Dataset Detail

Selecting a dataset loads `GET /v1/datasets/{name}` and `GET
/v1/datasets/{name}/refs`.

The detail pane should show:

- Dataset title and description.
- Primary `Clone` button.
- Branch selector defaulting to `default_branch`.
- Size, downloads, license, last updated, engine requirement, manifest hash.
- README rendered safely.
- Quick-start snippets.
- Schema preview.
- Sample preview.
- Branch highlights.
- Provenance and citation, when present.

Security rule: hub README content is untrusted. Render CommonMark with HTML
disabled or render a conservative subset. Sample values and schema fields must
be escaped as text, not injected as HTML.

### Clone Flow

From the detail pane:

1. User clicks `Clone`.
2. The extension asks where to create the new folder.
3. The default folder name is the dataset slug, not `<dataset>.strata`.
4. The user can edit the folder name.
5. The extension calls the existing clone wrapper with:
   - dataset slug
   - selected branch, when not the hub default
   - selected destination folder
   - hub URL only when the user explicitly picked a non-default per-session hub

The UI should not make the user type `.strata`. Strata creates a folder; the
extension should present it as a folder.

On success:

- Connect the cloned database automatically.
- Show an inline success panel with destination, object/byte/hash metrics when
  available, and next actions.
- Offer `Open Object Browser`.
- Offer `Reveal` in the Strata explorer.
- Offer `Copy Path`.
- Preserve the selected branch context if possible.

On failure:

- Show the stable core error code and hint.
- Offer `Retry` for transport errors.
- Offer `Change Destination` for destination collisions.
- Offer `Change Hub` for hub URL or transport failures.
- Offer `Open Error Docs` when a docs URL is available.

### Empty, Loading, And Offline States

Loading:

- show the effective hub URL
- show skeleton rows or a compact spinner
- keep filters disabled until the first response

Empty hub:

- `No datasets published on this hub`
- show hub URL
- actions: `Refresh`, `Change Hub URL`

No local binary:

- browsing HTTP could technically work without the binary, but clone cannot.
- show the catalog if possible, but clone buttons are disabled with `Set Strata
  Binary Path`.

Offline:

- show the attempted hub URL
- show the request failure
- actions: `Retry`, `Change Hub URL`, `Use Default Hub`

Unsupported hub protocol:

- if `/v1/info` fails or reports an unsupported protocol, show `Unsupported
  StrataHub server` with details.

## Architecture

### Browse Path

V1 pragmatic path:

```text
extension host -> HTTPS GET /v1/info
extension host -> HTTPS GET /v1/datasets
extension host -> HTTPS GET /v1/datasets/{name}
extension host -> HTTPS GET /v1/datasets/{name}/refs
extension host -> webview postMessage sanitized JSON
```

The webview should not fetch the network directly. The existing webview CSP
for object views is intentionally strict; the same posture should apply here.
All network I/O belongs in the extension host.

Preferred end-state after `strata-core#3041`:

```text
extension host -> strata executor hub.info/list/get/list_refs
```

That would let core own URL resolution, request behavior, protocol parsing,
error classification, and compatibility policy for browsing too.

### Clone Path

Keep clone delegated to core:

```text
extension -> strata clone <dataset> <dest> --json [--branch <branch>] [--hub <url>]
```

Do not rebuild clone with direct `stratahub-client` calls in the extension.
Core owns resume, hash verification, compatibility checks, import, and origin
tracking.

The extension feature-detects `strata clone --progress jsonl`. When available,
clone progress drives both the VS Code notification and the inline Hub detail
panel through ref resolution, manifest fetch, object fetches, local import, and
completion. Older CLIs still show indeterminate progress and the same success
actions after the clone returns.

### Caching

The hub list/detail handlers currently use a 60-second cache policy. The
extension should maintain an in-memory cache keyed by:

- hub URL
- endpoint path
- query string

Cache behavior:

- use cached data immediately when revisiting within 60 seconds
- refresh on explicit user action
- keep stale data visible when refresh fails, clearly marked as stale
- do not persist hub responses to disk in V1

### Telemetry

Do not add extension telemetry for hub browsing in V1.

The hub has its own privacy-bounded telemetry endpoint, but the extension should
not call it directly unless core defines that as part of the clone/browse
contract.

## Required Extension Work

1. Add a `strata.browseHub` command.
2. Add a hub browser webview or native tree/detail view.
3. Add an extension-host hub API client for `/v1/datasets` search/facet reads
   until `strata-core#3041` lands.
4. Add typed TypeScript models for the V1 wire shapes used by the UI.
5. Resolve effective hub URL via `strata --json config show`.
6. Build catalog list, filters, sort, server-backed search, pagination, and
   states.
7. Build dataset detail rendering with sanitized README/snippets/schema/preview.
8. Wire detail-page clone into the existing `runClone` wrapper.
9. Change clone destination defaults in the extension UI to folder names without
   a `.strata` suffix.
10. Auto-connect and reveal cloned databases after successful clone.
11. Add tests for URL resolution parsing, query construction, response parsing,
    error states, and clone argument construction.

## Core And Hub Liaison Questions

1. Should `strata-core` expose executor commands for browse?

   Proposed commands:

   - `hub.info`
   - `hub.list_datasets`
   - `hub.get_dataset`
   - `hub.list_refs`
   - `hub.list_yanked`

2. Is `strata --json config show` a stable contract for the extension to use?
3. Should there be a dedicated command for effective hub URL only?

   ```sh
   strata --json config get-resolved hub.url
   ```

4. Should dataset detail expose screenshots or visual assets in V1, or should
   the extension stay text/schema/sample based?
5. Is `clone_command` display-only, or should frontends treat it as a canonical
   command template?
6. Should `strata clone` keep its CLI default destination as `<dataset>.strata`
   while the extension defaults to `<dataset>`, or should core also change the
   default?
7. Should yanked datasets be hidden from browse, shown with warnings, or only
   checked after clone/remote origin inspection?
8. What are the expected error shapes for private hubs, auth-required hubs, and
    unsupported protocol versions?

## Future Work

Not V1:

- Authentication.
- Publishing datasets.
- Private dataset visibility.
- Sync, pull, and push.
- Organization/team hub management.
- Ratings, comments, stars, or social features.
- In-browser WASM preview before clone.
- Dataset recommendations from current project context.

## Acceptance Criteria

The feature is ready when:

- The user can open `Strata: Browse StrataHub Datasets`.
- The browser uses the same effective hub URL as the CLI.
- The user can filter, sort, search the full catalog, and page through datasets.
- Selecting a dataset shows a useful detail card with branches and sample/schema
  context when available.
- Clone creates a folder with a human folder name by default.
- Successful clone automatically appears in the Strata explorer.
- Offline, empty, invalid-hub, binary-missing, and clone-failure states are
  designed and actionable.
- The extension does not duplicate core clone orchestration.
