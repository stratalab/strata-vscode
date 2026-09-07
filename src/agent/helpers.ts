import { COMMANDS, type CommandId } from "../generated";
import type { Primitive } from "../explorer/model";
import { buildStrataEntries } from "../mcp/registration";

export type StarterLanguage = "typescript" | "python";
export type InferenceDocCommand =
  | "inference.capability"
  | "inference.models.list"
  | "inference.generate"
  | "inference.embed"
  | "inference.rank";

export interface AgentScope {
  dbPath: string;
  branch: string;
  space: string;
  primitive?: Primitive;
}

const PRIMITIVE_DOC_COMMANDS: Record<Primitive, CommandId> = {
  kv: "kv.list",
  json: "json.list",
  events: "event.list",
  vectors: "vector.collection.list",
  graph: "graph.list",
};

export function mcpSetupForDatabase(dbPath: string, binary: string | null): string {
  return mcpSetupForDatabases([dbPath], binary);
}

export function mcpSetupForDatabases(dbPaths: string[], binary: string | null): string {
  return JSON.stringify(
    {
      mcpServers: buildStrataEntries(dbPaths, binary ?? "strata"),
    },
    null,
    2,
  ) + "\n";
}

export function starterSnippet(language: StarterLanguage, scope: AgentScope, binary: string | null): string {
  return language === "typescript"
    ? typescriptSnippet(scope, binary)
    : pythonSnippet(scope, binary);
}

export function branchHandoffPrompt(scope: AgentScope): string {
  const spaceLine = scope.space === "default" ? "" : `\nSpace: ${scope.space}`;
  return `Use this Strata database branch for the next run.

Database: ${scope.dbPath}
Branch: ${scope.branch}${spaceLine}

Keep the current/default branch unchanged. Route all reads and writes for this experiment through the branch above.

Python SDK:

import stratadb

db = stratadb.open(${JSON.stringify(scope.dbPath)})
memory = db.at(branch=${JSON.stringify(scope.branch)}, space=${JSON.stringify(scope.space)})

# Use memory.kv, memory.json, memory.events, memory.vectors, memory.graphs for this run.

CLI equivalent:

strata --db ${JSON.stringify(scope.dbPath)} --branch ${JSON.stringify(scope.branch)} --space ${JSON.stringify(scope.space)} ...
`;
}

export function primitiveDocsUrl(primitive: Primitive): string {
  return commandDocsUrl(PRIMITIVE_DOC_COMMANDS[primitive]);
}

export function strataApiDocsUrl(): string {
  return commandDocsUrl("admin.info");
}

export function inferenceDocsUrl(commandId: InferenceDocCommand): string {
  return commandDocsUrl(commandId);
}

function commandDocsUrl(commandId: CommandId): string {
  return `https://stratadb.org${COMMANDS[commandId].docsPath}`;
}

function primitiveArgs(scope: AgentScope): string[] {
  switch (scope.primitive) {
    case "json":
      return ["json", "list", "--limit", "50"];
    case "events":
      return ["event", "list", "--limit", "50"];
    case "vectors":
      return ["vector", "collection", "list"];
    case "graph":
      return ["graph", "list"];
    case "kv":
    default:
      return ["kv", "list", "--limit", "50"];
  }
}

function scopedArgs(scope: AgentScope): string[] {
  const args = ["--db", scope.dbPath, "--json", ...primitiveArgs(scope)];
  if (scope.branch !== "default") args.push("--branch", scope.branch);
  if (scope.space !== "default") args.push("--space", scope.space);
  return args;
}

function typescriptSnippet(scope: AgentScope, binary: string | null): string {
  return `import { spawnSync } from "node:child_process";

const strata = ${JSON.stringify(binary ?? "strata")};
const args = ${JSON.stringify(scopedArgs(scope), null, 2)};

const result = spawnSync(strata, args, { encoding: "utf8" });
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "strata command failed");
}

const envelope = JSON.parse(result.stdout);
console.log(envelope.data ?? envelope);
`;
}

function pythonSnippet(scope: AgentScope, binary: string | null): string {
  return `import json
import subprocess

strata = ${JSON.stringify(binary ?? "strata")}
args = ${JSON.stringify(scopedArgs(scope))}

result = subprocess.run([strata, *args], capture_output=True, text=True, check=True)
envelope = json.loads(result.stdout)
print(envelope.get("data", envelope))
`;
}
