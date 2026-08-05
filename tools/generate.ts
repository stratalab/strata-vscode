/**
 * Build-time generator (AR-1.2): emits committed TypeScript from the vendored
 * IDL artifacts in idl/v1 — command catalog, error registry, request/response
 * types, and version stamps. No hand-rolled command definitions anywhere else.
 *
 * Usage:
 *   npm run generate              # write src/generated/
 *   npm run generate -- --check   # verify committed output matches (CI no-diff guard, AR-1.3)
 *
 * Determinism: output depends only on idl/v1 contents. Commands, defs, and
 * error codes are emitted in sorted order; no timestamps.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";

const REPO_ROOT = path.resolve(__dirname, "..");
const IDL_DIR = path.join(REPO_ROOT, "idl", "v1");
const OUT_DIR = path.join(REPO_ROOT, "src", "generated");

// ---------------------------------------------------------------------------
// Vendored artifact shapes (the subset this generator consumes)
// ---------------------------------------------------------------------------

interface CommandIndex {
  schema_version: string;
  generator_version: string;
  commands: IndexCommand[];
}

interface IndexCommand {
  id: string;
  family: string;
  op: string;
  kind: string;
  title: string;
  summary: string;
  description: string;
  docs: string;
  cli: { path?: string[]; surface: "verb" | "wire" };
  mcp?: { name?: string; description?: string };
  access: "read" | "write";
  wire_status: string;
  response_model: string;
  commit: string;
  pagination: string;
  batch: string;
  errors?: Array<{ code: string; docs?: string }>;
  fixtures?: { request?: string; response?: string };
}

type Schema = {
  $defs?: Record<string, Schema>;
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  patternProperties?: Record<string, Schema>;
  items?: Schema;
  description?: string;
  contentEncoding?: string;
  command?: string;
  request?: Schema;
  response?: Schema;
};

// ---------------------------------------------------------------------------
// Loading + validation (AR-1.4 stamp checks, vendoring consistency)
// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`generate: ${message}`);
  process.exit(1);
}

function loadArtifacts() {
  const rev = fs.readFileSync(path.join(IDL_DIR, "STRATA_CORE_REV"), "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(rev)) fail(`STRATA_CORE_REV is not a full 40-hex sha: "${rev}"`);

  const manifest = YAML.parse(fs.readFileSync(path.join(IDL_DIR, "manifest.yaml"), "utf8")) as {
    schema_version: string;
    generator_version: string;
  };
  const errorsDoc = YAML.parse(fs.readFileSync(path.join(IDL_DIR, "errors.yaml"), "utf8")) as {
    errors: string[];
  };
  const index = JSON.parse(
    fs.readFileSync(path.join(IDL_DIR, "generated", "command-index.json"), "utf8"),
  ) as CommandIndex;

  if (manifest.schema_version !== index.schema_version) {
    fail(
      `stamp mismatch: manifest schema_version=${manifest.schema_version} vs index ${index.schema_version}`,
    );
  }
  if (manifest.generator_version !== index.generator_version) {
    fail(
      `stamp mismatch: manifest generator_version=${manifest.generator_version} vs index ${index.generator_version}`,
    );
  }
  if (index.commands.length === 0) fail("command index is empty");

  const commands = [...index.commands].sort((a, b) => a.id.localeCompare(b.id));
  const errorCodes = [...errorsDoc.errors].sort();
  const errorSet = new Set(errorCodes);

  const schemas = new Map<string, Schema>();
  for (const cmd of commands) {
    const schemaPath = path.join(IDL_DIR, "generated", "schemas", `${cmd.id}.json`);
    if (!fs.existsSync(schemaPath)) fail(`missing schema for command ${cmd.id}`);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as Schema;
    if (schema.command !== cmd.id) {
      fail(`schema ${cmd.id}.json declares command=${schema.command}`);
    }
    schemas.set(cmd.id, schema);
    for (const err of cmd.errors ?? []) {
      if (!errorSet.has(err.code)) {
        fail(`command ${cmd.id} references error ${err.code} not present in errors.yaml`);
      }
    }
  }
  return { rev, manifest, errorCodes, commands, schemas };
}

// ---------------------------------------------------------------------------
// Shared $defs collection — one global namespace, collision-checked
// ---------------------------------------------------------------------------

function collectDefs(
  commands: IndexCommand[],
  schemas: Map<string, Schema>,
): Map<string, Schema> {
  const defs = new Map<string, Schema>();
  const canon = new Map<string, string>();
  for (const cmd of commands) {
    const schema = schemas.get(cmd.id)!;
    for (const [name, def] of Object.entries(schema.$defs ?? {})) {
      const c = JSON.stringify(sortKeysDeep(def));
      const seen = canon.get(name);
      if (seen === undefined) {
        canon.set(name, c);
        defs.set(name, def);
      } else if (seen !== c) {
        fail(
          `$defs collision: "${name}" has different shapes across schemas (first seen before ${cmd.id}); ` +
            `the global-dedup assumption no longer holds — teach the generator to disambiguate`,
        );
      }
    }
  }
  return new Map([...defs.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// JSON Schema → TypeScript expression
// ---------------------------------------------------------------------------

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function pascalCase(id: string): string {
  return id
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function isBytes(schema: Schema): boolean {
  return schema.type === "string" && schema.contentEncoding === "base64";
}

/** Renders a schema as a TS type expression. `indent` is the current indent level. */
function tsType(schema: Schema, indent: number): string {
  if (schema.$ref !== undefined) {
    const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    if (!m) fail(`unsupported $ref target: ${schema.$ref}`);
    return m[1] === "Bytes" ? "Bytes" : m[1]!;
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum !== undefined) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.oneOf) return unionOf(schema.oneOf, indent);
  if (schema.anyOf) return unionOf(schema.anyOf, indent);
  if (isBytes(schema)) return "Bytes";

  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type !== undefined
      ? [schema.type]
      : schema.properties || schema.additionalProperties || schema.patternProperties
        ? ["object"]
        : null;
  if (types === null) return "unknown";
  return types.map((t) => singleType(t, schema, indent)).join(" | ");
}

function unionOf(arms: Schema[], indent: number): string {
  return arms.map((arm) => parenthesize(tsType(arm, indent))).join(" | ");
}

function parenthesize(expr: string): string {
  return expr.includes(" | ") && !expr.startsWith("(") ? `(${expr})` : expr;
}

function singleType(t: string, schema: Schema, indent: number): string {
  switch (t) {
    case "string":
      return isBytes(schema) ? "Bytes" : "string";
    case "integer":
    case "number":
      // All numeric formats in the corpus (uint64 etc.) map to number; values
      // above 2^53 would lose precision through JSON.parse — a wire-wide V1
      // caveat, not a generator choice.
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const item = schema.items ? tsType(schema.items, indent) : "unknown";
      return `${parenthesize(item)}[]`;
    }
    case "object":
      return objectType(schema, indent);
    default:
      fail(`unsupported schema type: ${t}`);
  }
}

function objectType(schema: Schema, indent: number): string {
  const pad = "  ".repeat(indent + 1);
  const closePad = "  ".repeat(indent);
  const lines: string[] = [];
  const required = new Set(schema.required ?? []);

  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const doc = jsdoc(prop.description, indent + 1);
    if (doc) lines.push(doc);
    const key = IDENT_RE.test(name) ? name : JSON.stringify(name);
    const optional = required.has(name) ? "" : "?";
    lines.push(`${pad}${key}${optional}: ${tsType(prop, indent + 1)};`);
  }

  // Map-shaped objects: additionalProperties / patternProperties as index signatures.
  const extra: string[] = [];
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    extra.push(tsType(schema.additionalProperties, indent + 1));
  }
  for (const pattern of Object.values(schema.patternProperties ?? {})) {
    extra.push(tsType(pattern, indent + 1));
  }
  if (extra.length > 0) {
    lines.push(`${pad}[key: string]: ${[...new Set(extra)].join(" | ")};`);
  }

  if (lines.length === 0) return "Record<string, never>";
  return `{\n${lines.join("\n")}\n${closePad}}`;
}

function jsdoc(description: string | undefined, indent: number): string | null {
  if (!description) return null;
  const pad = "  ".repeat(indent);
  const safe = description.replace(/\*\//g, "*\\/");
  const lines = safe.split("\n");
  if (lines.length === 1) return `${pad}/** ${lines[0]} */`;
  return `${pad}/**\n${lines.map((l) => `${pad} * ${l}`.trimEnd()).join("\n")}\n${pad} */`;
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

const HEADER = `// GENERATED FILE — do not edit by hand.
// Emitted by tools/generate.ts from the vendored IDL in idl/v1
// (strata-core @ idl/v1/STRATA_CORE_REV). Regenerate with \`npm run generate\`.
`;

function emitStamps(rev: string, manifest: { schema_version: string; generator_version: string }) {
  return `${HEADER}
/** IDL version stamps sent in the IPC hello and compared against the owner's (AR-2.3, AR-6.1). */
export const IDL_STAMPS = {
  schemaVersion: ${JSON.stringify(manifest.schema_version)},
  generatorVersion: ${JSON.stringify(manifest.generator_version)},
} as const;

/** The strata-core revision the idl/v1 artifacts were vendored from (AR-1.1). */
export const STRATA_CORE_REV = ${JSON.stringify(rev)};
`;
}

function wireTypeOf(cmd: IndexCommand, schema: Schema): string {
  const t = schema.request?.properties?.type?.const;
  if (typeof t !== "string") fail(`command ${cmd.id}: request schema has no "type" const`);
  return t;
}

function emitCatalog(commands: IndexCommand[], schemas: Map<string, Schema>): string {
  const ids = commands.map((c) => c.id);
  const kinds = [...new Set(commands.map((c) => c.kind))].sort();
  const paginations = [...new Set(commands.map((c) => c.pagination))].sort();
  const batches = [...new Set(commands.map((c) => c.batch))].sort();
  const commits = [...new Set(commands.map((c) => c.commit))].sort();
  const wireStatuses = [...new Set(commands.map((c) => c.wire_status))].sort();

  const union = (values: string[]) => values.map((v) => JSON.stringify(v)).join(" | ");

  const entries = commands
    .map((cmd) => {
      const schema = schemas.get(cmd.id)!;
      const wireType = wireTypeOf(cmd, schema);
      const cliPath = cmd.cli.surface === "verb" && cmd.cli.path ? cmd.cli.path : null;
      const entry = {
        id: cmd.id,
        family: cmd.family,
        op: cmd.op,
        wireType,
        title: cmd.title,
        summary: cmd.summary,
        description: cmd.description,
        docsPath: cmd.docs,
        kind: cmd.kind,
        access: cmd.access,
        cliSurface: cmd.cli.surface,
        cliPath,
        cliDisplay: cliPath ? `strata ${cliPath.join(" ")}` : null,
        mcpToolName: cmd.mcp?.name ?? null,
        pagination: cmd.pagination,
        batch: cmd.batch,
        commit: cmd.commit,
        wireStatus: cmd.wire_status,
        responseModel: cmd.response_model,
        errorCodes: (cmd.errors ?? []).map((e) => e.code).sort(),
        requestFixture: cmd.fixtures?.request ?? null,
        responseFixture: cmd.fixtures?.response ?? null,
      };
      return `  ${JSON.stringify(cmd.id)}: ${JSON.stringify(entry, null, 4).replace(/\n/g, "\n  ")},`;
    })
    .join("\n");

  const readIds = commands.filter((c) => c.access === "read").map((c) => c.id);
  const writeIds = commands.filter((c) => c.access === "write").map((c) => c.id);
  const wireMap = commands
    .map((cmd) => `  ${JSON.stringify(wireTypeOf(cmd, schemas.get(cmd.id)!))}: ${JSON.stringify(cmd.id)},`)
    .join("\n");

  return `${HEADER}
export type CommandId =
${ids.map((id) => `  | ${JSON.stringify(id)}`).join("\n")};

export type CommandAccess = "read" | "write";
export type CommandKind = ${union(kinds)};
export type CommandCliSurface = "verb" | "wire";
export type CommandPagination = ${union(paginations)};
export type CommandBatchMode = ${union(batches)};
export type CommandCommitMode = ${union(commits)};
export type CommandWireStatus = ${union(wireStatuses)};

export interface CommandCatalogEntry {
  readonly id: CommandId;
  readonly family: string;
  readonly op: string;
  /** Wire discriminator: the \`type\` tag of the request envelope's command object (AR-1.6). */
  readonly wireType: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly docsPath: string;
  readonly kind: CommandKind;
  /** Read/write classification — conformance-pinned upstream; drives the console gate (AR-1.5, AR-4.2). */
  readonly access: CommandAccess;
  readonly cliSurface: CommandCliSurface;
  readonly cliPath: readonly string[] | null;
  /** "Copy as CLI command" rendering (F1.3); null for wire-only commands. */
  readonly cliDisplay: string | null;
  readonly mcpToolName: string | null;
  readonly pagination: CommandPagination;
  readonly batch: CommandBatchMode;
  readonly commit: CommandCommitMode;
  readonly wireStatus: CommandWireStatus;
  readonly responseModel: string;
  readonly errorCodes: readonly string[];
  /** Fixture paths are relative to idl/v1/fixtures/ (the N7 request corpus). */
  readonly requestFixture: string | null;
  readonly responseFixture: string | null;
}

export const COMMANDS: Readonly<Record<CommandId, CommandCatalogEntry>> = {
${entries}
};

export const COMMAND_IDS: readonly CommandId[] = [
${ids.map((id) => `  ${JSON.stringify(id)},`).join("\n")}
];

export const READ_COMMAND_IDS: readonly CommandId[] = [
${readIds.map((id) => `  ${JSON.stringify(id)},`).join("\n")}
];

export const WRITE_COMMAND_IDS: readonly CommandId[] = [
${writeIds.map((id) => `  ${JSON.stringify(id)},`).join("\n")}
];

export const WIRE_TYPE_TO_COMMAND: Readonly<Record<string, CommandId>> = {
${wireMap}
};
`;
}

/**
 * Codes come in two registered shapes:
 *   class.layer.slug          — engine/executor codes (class is static)
 *   inference.slug            — inference-boundary codes (class arrives only
 *                               on the runtime envelope; static class is null)
 * Anything else fails generation so a new shape gets a deliberate decision.
 */
function parseErrorCode(code: string): { cls: string | null; layer: string } {
  const parts = code.split(".");
  if (parts.length === 3) return { cls: parts[0]!, layer: parts[1]! };
  if (parts.length === 2 && parts[0] === "inference") return { cls: null, layer: "inference" };
  fail(`unrecognized error-code shape: ${code}`);
}

function emitErrors(errorCodes: string[]): string {
  const classes = [
    ...new Set(errorCodes.map((c) => parseErrorCode(c).cls).filter((c): c is string => c !== null)),
  ].sort();
  const rows = errorCodes
    .map((code) => {
      const { cls, layer } = parseErrorCode(code);
      return `  ${JSON.stringify(code)}: { code: ${JSON.stringify(code)}, errorClass: ${JSON.stringify(cls)}, layer: ${JSON.stringify(layer)}, docsUrl: ${JSON.stringify(`https://stratadb.org/e/${code}`)} },`;
    })
    .join("\n");

  return `${HEADER}
// Registry note: retry_policy, commit_outcome, and hints are not exported by
// the vendored IDL artifacts — they live in strata-core's Rust error registry
// and arrive on every runtime error envelope (Appendix A). Error handling
// keys on class + code (N3); the static registry carries what the IDL knows.

export type ErrorRegistryClass = ${classes.map((c) => JSON.stringify(c)).join(" | ")};

export interface ErrorRegistryEntry {
  readonly code: string;
  /** Static class, or null for inference-boundary codes whose class arrives only at runtime. */
  readonly errorClass: ErrorRegistryClass | null;
  /** Emitting layer: engine / executor / inference. */
  readonly layer: string;
  readonly docsUrl: string;
}

export const ERROR_REGISTRY: Readonly<Record<string, ErrorRegistryEntry>> = {
${rows}
};

export const ERROR_CODES: readonly string[] = [
${errorCodes.map((code) => `  ${JSON.stringify(code)},`).join("\n")}
];
`;
}

function emitTypes(
  commands: IndexCommand[],
  schemas: Map<string, Schema>,
  defs: Map<string, Schema>,
): string {
  const parts: string[] = [];
  parts.push(`${HEADER}
// Numeric caveat: uint64 wire fields (versions, timestamps) are emitted as
// \`number\`; values above 2^53 would lose precision through JSON.parse.
//
// Request DTOs are deny_unknown_fields upstream (AR-6.2): never send fields
// outside these shapes. Response handling must tolerate unknown extra fields
// on display-only paths.

import type { WireBase64 } from "../wire/bytes";

/** Binary payload encoded as standard base64 on the wire (AR-1.7). */
export type Bytes = WireBase64;
`);

  for (const [name, def] of defs) {
    if (name === "Bytes") continue; // aliased to WireBase64 above
    const doc = jsdoc(def.description, 0);
    if (doc) parts.push(doc);
    const types = Array.isArray(def.type) ? def.type : def.type ? [def.type] : [];
    const isPlainObject =
      types.length === 1 &&
      types[0] === "object" &&
      !def.oneOf &&
      !def.anyOf &&
      def.const === undefined &&
      def.enum === undefined;
    if (isPlainObject) {
      parts.push(`export interface ${name} ${objectType(def, 0)}\n`);
    } else {
      parts.push(`export type ${name} = ${tsType(def, 0)};\n`);
    }
  }

  for (const cmd of commands) {
    const schema = schemas.get(cmd.id)!;
    const base = pascalCase(cmd.id);
    if (!schema.request || !schema.response) fail(`command ${cmd.id}: schema missing request/response`);
    const reqDoc = jsdoc(schema.request.description, 0);
    if (reqDoc) parts.push(reqDoc);
    parts.push(`export interface ${base}Request ${objectType(schema.request, 0)}\n`);
    const respDoc = jsdoc(schema.response.description, 0);
    if (respDoc) parts.push(respDoc);
    parts.push(`export interface ${base}Response ${objectType(schema.response, 0)}\n`);
  }

  const reqMap = commands
    .map((cmd) => `  ${JSON.stringify(cmd.id)}: ${pascalCase(cmd.id)}Request;`)
    .join("\n");
  const respMap = commands
    .map((cmd) => `  ${JSON.stringify(cmd.id)}: ${pascalCase(cmd.id)}Response;`)
    .join("\n");
  parts.push(`/** Request payload type per command id — the typed spine of the wire client (AR-2). */
export interface CommandRequests {
${reqMap}
}

/** Response payload type per command id. */
export interface CommandResponses {
${respMap}
}
`);

  return parts.join("\n");
}

function emitIndex(): string {
  return `${HEADER}
export * from "./stamps";
export * from "./catalog";
export * from "./errors";
export * from "./types";
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const check = process.argv.includes("--check");
  const { rev, manifest, errorCodes, commands, schemas } = loadArtifacts();

  // Wire types must be unique — the envelope dispatches on them.
  const wireTypes = new Set<string>();
  for (const cmd of commands) {
    const wt = wireTypeOf(cmd, schemas.get(cmd.id)!);
    if (wireTypes.has(wt)) fail(`duplicate wire type: ${wt}`);
    wireTypes.add(wt);
  }

  const defs = collectDefs(commands, schemas);

  // Generated wire defs share the barrel with catalog/errors/stamps exports;
  // a def name colliding with one of those would shadow it silently.
  const RESERVED = new Set([
    "CommandId", "CommandAccess", "CommandKind", "CommandCliSurface",
    "CommandPagination", "CommandBatchMode", "CommandCommitMode", "CommandWireStatus",
    "CommandCatalogEntry", "COMMANDS", "COMMAND_IDS", "READ_COMMAND_IDS",
    "WRITE_COMMAND_IDS", "WIRE_TYPE_TO_COMMAND", "ErrorRegistryClass",
    "ErrorRegistryEntry", "ERROR_REGISTRY", "ERROR_CODES", "IDL_STAMPS",
    "STRATA_CORE_REV", "CommandRequests", "CommandResponses",
  ]);
  // "Bytes" is intentionally absent: that wire $def is special-cased to the
  // WireBase64 alias rather than emitted, so it never collides.
  for (const name of defs.keys()) {
    if (RESERVED.has(name)) fail(`wire $def "${name}" collides with a reserved generated export; rename the emitter side`);
  }

  const files: Record<string, string> = {
    "stamps.ts": emitStamps(rev, manifest),
    "catalog.ts": emitCatalog(commands, schemas),
    "errors.ts": emitErrors(errorCodes),
    "types.ts": emitTypes(commands, schemas, defs),
    "index.ts": emitIndex(),
  };

  if (check) {
    const drifted: string[] = [];
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(OUT_DIR, name);
      const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
      if (existing !== content) drifted.push(name);
    }
    const stray = fs.existsSync(OUT_DIR)
      ? fs.readdirSync(OUT_DIR).filter((f) => !(f in files))
      : [];
    if (drifted.length > 0 || stray.length > 0) {
      if (drifted.length > 0) console.error(`generate --check: drift in ${drifted.join(", ")}`);
      if (stray.length > 0) console.error(`generate --check: stray files ${stray.join(", ")}`);
      console.error("run `npm run generate` and commit the result (AR-1.3).");
      process.exit(1);
    }
    console.log(`generate --check: src/generated is in sync with idl/v1 @ ${rev.slice(0, 12)}`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const stale of fs.readdirSync(OUT_DIR)) {
    if (!(stale in files)) fs.rmSync(path.join(OUT_DIR, stale));
  }
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
  }
  console.log(
    `generated ${Object.keys(files).length} files: ${commands.length} commands ` +
      `(${commands.filter((c) => c.access === "read").length} read), ` +
      `${defs.size} shared defs, ${errorCodes.length} error codes`,
  );
}

main();
