# Agent Enablement Core Liaison Brief

Status: draft
Last updated: 2026-09-02
Primary repos: `strata-vscode`, `strata-core`, `strata-agent-skills`

## Purpose

We want Strata to be the easiest database for AI-assisted app development. A
developer working in VS Code, Cursor, Claude Code, Codex, or another agent host
should be able to open a project, connect a Strata database, and have the agent
immediately understand how to use Strata APIs correctly.

This should not become duplicate product logic in the VS Code extension. The
extension should be the visible on-ramp and status surface. `strata-core` should
remain the source of truth for command semantics, MCP tools, generated docs,
error codes, and write-safety rules.

## Product Principle

The extension should answer this question for the user:

> Is my AI assistant ready to build with Strata in this workspace?

If the answer is no, the extension should make the fix one click. If the answer
is yes, the agent should have:

- An MCP server it can call.
- Version-matched docs and examples.
- Stable tool schemas and error remediation.
- Clear database, branch, and space context.
- Write access only under an explicit safety contract.

## What Already Exists

### In `strata-vscode`

The extension already has a meaningful agent-enablement foundation:

- `package.json` contributes `mcpServerDefinitionProviders` with the `strata`
  provider id.
- `src/ui/ecosystemUi.ts` registers a native VS Code MCP server definition
  provider through `vscode.lm.registerMcpServerDefinitionProvider` when the
  workspace is trusted and the Strata binary is available.
- The extension already has user commands:
  - `strata.registerAgents`
  - `strata.removeAgentRegistrations`
- `src/mcp/registration.ts` writes file-based MCP entries for:
  - `.mcp.json`
  - `.cursor/mcp.json`
- Those file writers are already designed to be idempotent, merge-safe, and
  reversible. They preserve foreign MCP entries, refuse malformed JSON, and
  remove only entries managed by the extension.
- The generated entries invoke the resolved machine-scoped binary path with:

  ```json
  {
    "command": "<resolved-strata-binary>",
    "args": ["--db", "<db-path>", "mcp", "serve"]
  }
  ```

- The getting-started walkthrough already includes an "AI agents" step.
- `docs/requirements.md` already defines F6: agent enablement through MCP
  registration.
- `src/generated/catalog.ts` already carries read/write classification and
  `mcpToolName` metadata for generated command entries.
- The status bar plumbing already uses `ipc_status.clients`, which means an
  MCP-connected agent can appear like any other connected client.

Current limitation: the extension writes configs and registers providers, but
it does not yet present a polished "AI Assistant Ready" UX, verify host-specific
approval state, expose docs/resources in the object browser, or distinguish
read-only and write-capable agent modes.

### In `strata-core`

Core already has more of this than the extension should recreate:

- `README.md` documents Strata as agent-native and shows:

  ```sh
  strata --db ./agent-memory mcp serve
  strata ./mydb agents guide
  strata ./mydb kv get user:ada --json
  ```

- `crates/cli/src/agents.rs` exposes the self-describing agent surface:
  - `strata agents guide`
  - `strata agents commands`
  - `strata agents errors`
  - `strata agents init`
  - `strata agents skill`
- `strata agents guide` is generated from the installed binary's embedded
  command metadata. It covers targeting, quickstart, output contracts, error
  handling, diagnostics, MCP, command catalog, and repo onboarding.
- `strata agents commands --json` exposes the generated command catalog.
- `strata agents errors --json` exposes stable public error codes with hints
  and docs refs.
- `strata agents init` writes `.strata/AGENTS.md` and can plant a pointer in
  `AGENTS.md` or `CLAUDE.md`.
- `strata agents skill --write` can write agent-specific guidance for:
  - Claude Code: `.claude/skills/strata/SKILL.md`
  - Cursor: `.cursor/rules/strata.mdc`
  - Codex: a managed section in `AGENTS.md`
- `crates/cli/src/mcp.rs` implements `strata mcp serve` over stdio.
- The current MCP server appears to expose tools only:
  - It handles `initialize`, `ping`, `tools/list`, and `tools/call`.
  - It advertises tool capability in `initialize`.
  - It does not currently appear to implement `resources/list`,
    `resources/read`, `prompts/list`, or `prompts/get`.
- The MCP tool surface is curated rather than exhaustive:
  - `strata_guide`
  - `strata_command`
  - core KV, JSON, vector, event, graph, and branch tools
- `strata_guide` returns the version-matched usage guide.
- `strata_command` is the escape hatch for any cataloged command as raw wire
  JSON.
- Core design docs already call out that `strata mcp serve` and roughly 20
  curated tools have landed, while packaging and registry distribution are
  still broader ecosystem work.

Current limitation: from extension inspection, we cannot tell which of these
surfaces are intended to be stable product contracts, which are still internal,
and which team owns packaging, host registration, and docs/resource expansion.

### Current Agent Host Reality

As of this review:

- VS Code supports MCP servers through workspace/user configuration and through
  extension-contributed MCP server definition providers. VS Code MCP servers can
  expose tools, resources, prompts, and apps.
- Cursor supports custom MCP servers via `mcp.json`, including project-level
  `.cursor/mcp.json` and global `~/.cursor/mcp.json`. Cursor documents tools,
  prompts, resources, roots, elicitation, and apps as supported capabilities.
- Claude Code supports project-scoped MCP servers through `.mcp.json` at the
  project root, with interactive approval/trust behavior.

The extension already targets `.mcp.json` and `.cursor/mcp.json`, which aligns
with Claude Code and Cursor. VS Code also has its own `.vscode/mcp.json` path,
but the extension currently uses the native provider path for VS Code instead
of writing that file.

References:

- VS Code MCP user docs: https://code.visualstudio.com/docs/agent-customization/mcp-servers
- VS Code MCP extension API: https://code.visualstudio.com/api/extension-guides/ai/mcp
- Cursor MCP docs: https://cursor.com/docs/mcp
- Claude Code MCP docs: https://code.claude.com/docs/en/mcp

## Working Hypothesis

Most of the important backend work is already started in `strata-core`.

The VS Code extension should not build its own agent docs, MCP tool manifest,
or SDK guidance by hand. It should consume core-provided outputs:

- `strata agents guide`
- `strata agents commands --json`
- `strata agents errors --json`
- `strata agents skill --write`
- `strata mcp serve`

The core liaison is needed to turn those surfaces into explicit contracts and
to decide what remains missing before the extension builds the first-class UX.

## Proposed Ownership

### `strata-core` Owns

- MCP server behavior and protocol capability support.
- Tool names, tool descriptions, input schemas, and output envelopes.
- Read/write command classification and write-safety enforcement.
- The generated command catalog.
- The generated agent guide.
- The public error registry.
- Version-matched docs and examples that agents should rely on.
- Any machine-readable manifest the extension consumes.
- Database targeting semantics for `mcp serve`.
- Runtime behavior for multi-database or workspace-aware MCP sessions.

### `strata-vscode` Owns

- Discovery of Strata databases visible to the editor.
- Discovery of the Strata binary.
- Workspace trust gating before writing configs or spawning the binary.
- The native VS Code MCP provider.
- User-facing setup, repair, and verification UI.
- Writing or delegating project-level MCP config changes.
- Showing agent readiness and connected-agent status.
- Providing quick access to core-generated docs and guides.
- Mapping object-browser context into useful commands for agents.

### `strata-agent-skills` Owns

- Host-specific skill/rule packaging.
- Full agent workflow guidance that is larger than a single binary-generated
  guide.
- One-command setup flows if the team decides those should remain outside
  `strata-core`.
- Cross-host packaging strategy for Claude Code, Cursor, Codex, and other
  agent runtimes.

## Decisions Needed From `strata-core`

### P0: Contract Decisions

1. Are `strata agents guide`, `strata agents commands --json`, and
   `strata agents errors --json` stable product contracts that the extension
   can call?
2. Is `strata agents skill --write` the official local writer for agent
   instructions, or should the extension continue writing host files itself?
3. Is `strata mcp serve` expected to be launched as:

   ```sh
   strata --db <path> mcp serve
   ```

   or:

   ```sh
   strata <path> mcp serve
   ```

   The extension currently uses the `--db` form. The agent guide currently
   shows the positional form in at least one place. We should standardize on
   the recommended config form.

4. Should the MCP server be read-write by default?
5. If not, what is the intended read-only launch contract?

   Possible shapes:

   ```sh
   strata --db <path> --read-only mcp serve
   strata --db <path> mcp serve --read-only
   strata --db <path> mcp serve --mode read
   ```

6. If write tools are exposed, does core enforce capability errors for
   read-only sessions, or should the server suppress write tools entirely?
7. Will core add MCP resources and prompts, or should the guide remain exposed
   only as the `strata_guide` tool?
8. Should core expose an MCP or CLI manifest for setup tooling?

   Proposed shape:

   ```sh
   strata agents manifest --json
   ```

   The manifest could include CLI version, MCP command form, supported host
   config targets, tool counts, resources/prompts support, read/write mode
   support, and links to generated docs.

9. Is `strata-agent-skills` the canonical place for richer host-specific
   guidance, or should the binary-generated skill become the canonical source?
10. Does `mcp serve` safely coexist with an existing IPC owner and the VS Code
    extension's read-only client connection?

### P1: UX Enablement Decisions

1. Should the extension delegate setup to core commands, or keep direct file
   writers?
2. Should the extension support `.vscode/mcp.json` in addition to the native VS
   Code provider?
3. Should there be a core command for verification, such as:

   ```sh
   strata agents doctor --json
   strata mcp doctor --json
   ```

4. Can core expose the exact list of MCP tools, resources, and prompts without
   requiring the extension to spawn a live MCP JSON-RPC session?
5. How should multi-database workspaces work?

   Current extension behavior pins one server entry per visible database when
   there are multiple databases. Requirements already say the desired end state
   is workspace-scoped registration where runtime database selection belongs to
   the MCP server.

6. Should the agent guide include SDK-specific recipes for Python, Node, and
   Rust, or should those live in generated docs/resources?
7. Should the object browser expose shortcuts like "Copy MCP setup",
   "Copy starter snippet", or "Open guide for this primitive"?
8. What should the extension show when a host requires approval, especially
   Claude Code project `.mcp.json` approvals?

## Recommended Core Deliverables

### M1: Agent Surface Manifest

Add a stable machine-readable manifest:

```sh
strata agents manifest --json
```

Minimum useful fields:

```json
{
  "version": "x.y.z",
  "mcp": {
    "command": "strata",
    "args": ["--db", "<path>", "mcp", "serve"],
    "supports_read_only": true,
    "default_mode": "read",
    "tools": { "count": 20, "curated": true },
    "resources": { "supported": false },
    "prompts": { "supported": false }
  },
  "agents": {
    "guide": { "command": ["agents", "guide"] },
    "commands": { "command": ["agents", "commands", "--json"] },
    "errors": { "command": ["agents", "errors", "--json"] },
    "skill": { "command": ["agents", "skill", "--write", "--for", "all"] }
  }
}
```

The extension can use this to avoid hardcoding paths, assumptions, and
capability checks.

### M2: Explicit Read/Write MCP Contract

Before the extension adds V2 write actions, core and extension should agree on
one of these policies:

- Read-only by default, with write tools hidden or rejected unless launched in
  write mode.
- Read-write by default, with host approval relied upon for every mutating tool.
- Split servers: `strata` for read-only and `strata-write` for write-capable
  sessions.

Recommendation: default agent setup should be read-only until the user opts into
write mode. The extension can show write enablement as a deliberate state, not a
side effect of registering MCP.

### M3: MCP Resources And Prompts

If supported by core, expose version-matched docs as MCP resources:

- `strata://guide`
- `strata://commands`
- `strata://errors`
- `strata://sdk/python`
- `strata://sdk/node`
- `strata://recipes/branching`
- `strata://recipes/time-travel`
- `strata://recipes/app-schema`

Useful prompts:

- `strata.design_schema`
- `strata.add_to_app`
- `strata.debug_query`
- `strata.plan_migration`
- `strata.use_branch_for_experiment`

This would let VS Code, Cursor, and Claude Code attach Strata guidance as
context without forcing the model to call a tool just to read docs.

### M4: Setup And Verification Commands

Core or `strata-agent-skills` should expose one official setup path. The
extension can call it instead of maintaining host-specific writer logic forever.

Possible command:

```sh
strata agents setup --workspace <path> --for vscode,cursor,claude,codex --json
```

Possible verification command:

```sh
strata agents doctor --workspace <path> --json
```

The output should tell the extension:

- Which configs exist.
- Which entries are current.
- Which entries are stale.
- Which files require user approval in the host.
- Which skill/rule files are installed.
- Whether the MCP command starts and lists tools successfully.

### M5: Workspace-Aware MCP Database Selection

The extension requirement already points toward workspace-scoped registration.
Core should decide whether the MCP server can:

- Discover databases from workspace roots.
- Accept multiple `--db` arguments.
- Start with no database and expose an `open_database` tool.
- Reuse the same database discovery contract as the extension.

Until that lands, the extension can continue its transitional behavior of named
entries for multi-database workspaces.

## Recommended Extension UX After Core Alignment

Add an "AI Assistants" section in the Strata explorer or object browser:

- Readiness headline:
  - `Ready`
  - `Needs approval`
  - `Needs setup`
  - `Binary missing`
  - `No database connected`
- Per-host rows:
  - VS Code Agent Mode
  - Cursor
  - Claude Code
  - Codex
- Each row should show:
  - Registered or not registered.
  - Command path used.
  - Config file path, when file-based.
  - Approval required, when detectable.
  - Tool count and mode, such as `20 tools, read-only`.
- Primary actions:
  - `Set Up AI Assistants`
  - `Verify Setup`
  - `Open Agent Guide`
  - `Install Agent Skills`
  - `Remove Registrations`
- Context actions from database, branch, space, and primitive views:
  - `Copy MCP Setup`
  - `Copy TypeScript/Python Starter Snippet`
  - `Open Guide For This Primitive`

The setup flow should feel like a system capability, not a pile of JSON files.
The JSON files can remain visible in diagnostics, but they should not be the
user's mental model.

## Liaison Agenda

1. Confirm which core agent commands are stable contracts.
2. Confirm the canonical `mcp serve` launch form.
3. Decide read-only versus read-write default for agent MCP sessions.
4. Inspect the current MCP tool list and decide whether resources/prompts are
   needed for V1.
5. Decide whether setup writers live in `strata-vscode`, `strata-core`, or
   `strata-agent-skills`.
6. Define a manifest or doctor JSON output the extension can consume.
7. Decide the multi-database workspace story.
8. Define acceptance criteria for "AI Assistant Ready".

## Acceptance Criteria

The user-visible feature is complete when:

- A user opens a workspace with a Strata database and sees whether AI assistant
  setup is ready.
- One action registers the Strata MCP server for the supported agent hosts.
- The extension can verify that the MCP server starts and exposes the expected
  Strata tools.
- The agent can retrieve version-matched Strata guidance without web search.
- The agent can inspect the connected database, branch, space, and primitive
  data through MCP.
- Write access is clearly off or on, and the user can understand which state
  they are in.
- Broken setup produces a specific repair action, not a generic error.

## Risks

- Duplicated docs drift between core, extension, website, and skills.
- Host config formats continue to evolve.
- A broad MCP tool surface overwhelms models and host tool limits.
- A write-capable default creates user trust issues before the extension has a
  write UX.
- Bundled docs become stale if they are not generated from the installed core
  version.
- Multiple databases in one workspace remain awkward if runtime selection stays
  config-time only.

## Proposed Next Step

Send this document to the `strata-core` team and ask them to respond with:

1. Stable versus unstable status for each existing core surface.
2. The canonical `mcp serve` launch command.
3. The intended read/write safety model.
4. Whether they will provide `agents manifest --json` or equivalent.
5. Whether MCP resources/prompts belong in core for V1.
6. Whether setup and verification should move out of the extension and into
   core or `strata-agent-skills`.

Once those answers are in, the extension can build the polished AI assistant UX
without guessing at product contracts.
