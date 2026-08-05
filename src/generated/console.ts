// GENERATED FILE — do not edit by hand.
// Emitted by tools/generate.ts from the vendored IDL in idl/v1
// (strata-core @ idl/v1/STRATA_CORE_REV). Regenerate with `npm run generate`.

import type { CommandId } from "./catalog";

export interface FormField {
  readonly name: string;
  readonly required: boolean;
  readonly kind: "string" | "number" | "boolean" | "bytes" | "enum" | "json";
  readonly enumValues?: readonly string[];
  readonly description: string;
}

export interface CommandFormSpec {
  /** Request fields excluding the wire tag and scope (branch/space/as_of). */
  readonly fields: readonly FormField[];
  /** Whether the request schema carries the scope fields (scrub/branch injection). */
  readonly takesAsOf: boolean;
  readonly takesBranch: boolean;
  readonly takesSpace: boolean;
  /** The vendored example wire request, when the corpus has one. */
  readonly example: string | null;
}

export const COMMAND_FORMS: Readonly<Record<CommandId, CommandFormSpec>> = {
  "admin.config": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"config_get\"}"
  },
  "admin.config_key": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Config key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"configure_get_key\",\"key\":\"default_branch\"}"
  },
  "admin.describe": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"describe\"}"
  },
  "admin.health": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"health\"}"
  },
  "admin.hub_clone": {
      "fields": [
          {
              "name": "dataset",
              "required": true,
              "kind": "string",
              "description": "Dataset to clone."
          },
          {
              "name": "dest",
              "required": true,
              "kind": "string",
              "description": "Destination directory (must not exist, or be empty)."
          },
          {
              "name": "hub_url",
              "required": false,
              "kind": "string",
              "description": "Explicit hub URL; when absent the 5-layer resolver runs"
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"hub_clone\",\"dataset\":\"strata/titanic\",\"branch\":\"default\",\"dest\":\"./titanic.strata\"}"
  },
  "admin.info": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"info\"}"
  },
  "admin.ipc_status": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"ipc_status\"}"
  },
  "admin.ipc_stop": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"ipc_stop\"}"
  },
  "admin.metrics": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"metrics\"}"
  },
  "admin.ping": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"ping\"}"
  },
  "admin.remote": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"remote_get\"}"
  },
  "arrow.export": {
      "fields": [
          {
              "name": "collection",
              "required": false,
              "kind": "string",
              "description": "Target vector collection for vector exports."
          },
          {
              "name": "event_type",
              "required": false,
              "kind": "string",
              "description": "Optional event type filter for event exports."
          },
          {
              "name": "format",
              "required": true,
              "kind": "json",
              "description": "Output file format."
          },
          {
              "name": "graph",
              "required": false,
              "kind": "string",
              "description": "Target graph for graph exports."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional row limit."
          },
          {
              "name": "path",
              "required": true,
              "kind": "string",
              "description": "Output file path. Graph exports treat this as a stem and return concrete node and edge paths."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "string",
              "description": "Optional key, document, vector-key, or node-id prefix."
          },
          {
              "name": "primitive",
              "required": true,
              "kind": "json",
              "description": "Product primitive to export."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"arrow_export\",\"primitive\":\"kv\",\"format\":\"csv\",\"path\":\"kv_out.csv\"}"
  },
  "arrow.import": {
      "fields": [
          {
              "name": "collection",
              "required": false,
              "kind": "string",
              "description": "Target vector collection for vector imports."
          },
          {
              "name": "file_path",
              "required": true,
              "kind": "string",
              "description": "Input file path."
          },
          {
              "name": "format",
              "required": false,
              "kind": "json",
              "description": "Input file format. Defaults to extension detection."
          },
          {
              "name": "graph",
              "required": false,
              "kind": "string",
              "description": "Target graph for graph imports."
          },
          {
              "name": "key_column",
              "required": false,
              "kind": "string",
              "description": "Optional key column override."
          },
          {
              "name": "target",
              "required": true,
              "kind": "json",
              "description": "Product primitive to import into."
          },
          {
              "name": "value_column",
              "required": false,
              "kind": "string",
              "description": "Optional value, document, or embedding column override."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"arrow_import\",\"file_path\":\"input.csv\",\"format\":\"csv\",\"target\":\"kv\"}"
  },
  "branch.create": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"branch_create\",\"branch\":\"feature\"}"
  },
  "branch.delete": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"branch_delete\",\"branch\":\"feature\"}"
  },
  "branch.fork": {
      "fields": [
          {
              "name": "source",
              "required": true,
              "kind": "string",
              "description": "Source branch name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"branch_fork_current\",\"source\":\"default\",\"branch\":\"feature-fork\"}"
  },
  "branch.fork_at_timestamp": {
      "fields": [
          {
              "name": "source",
              "required": true,
              "kind": "string",
              "description": "Source branch name."
          },
          {
              "name": "timestamp",
              "required": true,
              "kind": "number",
              "description": "Source timestamp in microseconds."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"branch_fork_at_timestamp\",\"source\":\"default\",\"branch\":\"feature-fork\",\"timestamp\":3}"
  },
  "branch.fork_at_version": {
      "fields": [
          {
              "name": "source",
              "required": true,
              "kind": "string",
              "description": "Source branch name."
          },
          {
              "name": "version",
              "required": true,
              "kind": "number",
              "description": "Source version."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"branch_fork_at_version\",\"source\":\"default\",\"branch\":\"feature-fork\",\"version\":3}"
  },
  "branch.get": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"branch_get\",\"branch\":\"feature\"}"
  },
  "branch.list": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"branch_list\"}"
  },
  "event.append": {
      "fields": [
          {
              "name": "event_type",
              "required": true,
              "kind": "string",
              "description": "Event type."
          },
          {
              "name": "payload",
              "required": true,
              "kind": "json",
              "description": "Event payload."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_append\",\"event_type\":\"user.created\",\"payload\":{\"name\":\"Ada\"}}"
  },
  "event.batch_append": {
      "fields": [
          {
              "name": "entries",
              "required": true,
              "kind": "json",
              "description": "Events to append."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_batch_append\",\"entries\":[{\"event_type\":\"user.created\",\"payload\":{\"name\":\"Ada\"}},{\"event_type\":\"user.updated\",\"payload\":{\"plan\":\"pro\"}}]}"
  },
  "event.count": {
      "fields": [],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_count\"}"
  },
  "event.exists": {
      "fields": [
          {
              "name": "sequence",
              "required": true,
              "kind": "number",
              "description": "Event sequence."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_exists\",\"sequence\":0}"
  },
  "event.get": {
      "fields": [
          {
              "name": "sequence",
              "required": true,
              "kind": "number",
              "description": "Event sequence."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_get\",\"sequence\":0}"
  },
  "event.list": {
      "fields": [
          {
              "name": "after_sequence",
              "required": false,
              "kind": "number",
              "description": "Optional exclusive sequence cursor."
          },
          {
              "name": "event_type",
              "required": false,
              "kind": "string",
              "description": "Optional event type filter."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_list\",\"limit\":10}"
  },
  "event.range": {
      "fields": [
          {
              "name": "direction",
              "required": true,
              "kind": "json",
              "description": "Result ordering."
          },
          {
              "name": "end_seq",
              "required": false,
              "kind": "number",
              "description": "Optional exclusive end sequence; with reverse direction, exclusive lower bound."
          },
          {
              "name": "event_type",
              "required": false,
              "kind": "string",
              "description": "Optional event type filter."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit."
          },
          {
              "name": "start_seq",
              "required": true,
              "kind": "number",
              "description": "Inclusive start sequence; with reverse direction, walk backward from this sequence."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_range\",\"start_seq\":0,\"direction\":\"forward\"}"
  },
  "event.range_time": {
      "fields": [
          {
              "name": "direction",
              "required": true,
              "kind": "json",
              "description": "Result ordering."
          },
          {
              "name": "end_ts",
              "required": false,
              "kind": "number",
              "description": "Optional inclusive end timestamp in microseconds."
          },
          {
              "name": "event_type",
              "required": false,
              "kind": "string",
              "description": "Optional event type filter."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit."
          },
          {
              "name": "start_ts",
              "required": true,
              "kind": "number",
              "description": "Inclusive start timestamp in microseconds."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_range_by_time\",\"start_ts\":0,\"direction\":\"forward\"}"
  },
  "event.types": {
      "fields": [],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_list_types\"}"
  },
  "event.verify_chain": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"event_verify_chain\"}"
  },
  "graph.analytics.bfs": {
      "fields": [
          {
              "name": "budget",
              "required": false,
              "kind": "json",
              "description": "Optional snapshot size bounds. Defaults to the engine limits."
          },
          {
              "name": "direction",
              "required": false,
              "kind": "json",
              "description": "Optional traversal direction. Defaults to outgoing."
          },
          {
              "name": "edge_types",
              "required": false,
              "kind": "json",
              "description": "Optional edge-type restriction applied at every hop."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "max_depth",
              "required": false,
              "kind": "number",
              "description": "Optional depth bound. Defaults to 100."
          },
          {
              "name": "max_nodes",
              "required": false,
              "kind": "number",
              "description": "Optional visited-node bound. Defaults to 10000."
          },
          {
              "name": "start",
              "required": true,
              "kind": "string",
              "description": "Start node id."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_bfs\",\"graph\":\"social\",\"start\":\"alice\",\"max_depth\":2}"
  },
  "graph.analytics.cdlp": {
      "fields": [
          {
              "name": "budget",
              "required": false,
              "kind": "json",
              "description": "Optional snapshot size bounds. Defaults to the engine limits."
          },
          {
              "name": "direction",
              "required": false,
              "kind": "json",
              "description": "Optional propagation direction. Defaults to both."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "max_iterations",
              "required": false,
              "kind": "number",
              "description": "Optional iteration bound. Defaults to 10."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_cdlp\",\"graph\":\"social\"}"
  },
  "graph.analytics.lcc": {
      "fields": [
          {
              "name": "budget",
              "required": false,
              "kind": "json",
              "description": "Optional snapshot size bounds. Defaults to the engine limits."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_lcc\",\"graph\":\"social\"}"
  },
  "graph.analytics.pagerank": {
      "fields": [
          {
              "name": "budget",
              "required": false,
              "kind": "json",
              "description": "Optional snapshot size bounds. Defaults to the engine limits."
          },
          {
              "name": "damping",
              "required": false,
              "kind": "number",
              "description": "Optional damping factor. Defaults to 0.85."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "max_iterations",
              "required": false,
              "kind": "number",
              "description": "Optional iteration bound. Defaults to 20."
          },
          {
              "name": "personalization",
              "required": false,
              "kind": "json",
              "description": "Optional seed weights (node id to weight). When present, both"
          },
          {
              "name": "tolerance",
              "required": false,
              "kind": "number",
              "description": "Optional convergence tolerance. Defaults to 1e-6."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_pagerank\",\"graph\":\"social\"}"
  },
  "graph.analytics.sssp": {
      "fields": [
          {
              "name": "budget",
              "required": false,
              "kind": "json",
              "description": "Optional snapshot size bounds. Defaults to the engine limits."
          },
          {
              "name": "direction",
              "required": false,
              "kind": "json",
              "description": "Optional traversal direction. Defaults to outgoing."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "source",
              "required": true,
              "kind": "string",
              "description": "Source node id."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_sssp\",\"graph\":\"social\",\"source\":\"alice\"}"
  },
  "graph.analytics.wcc": {
      "fields": [
          {
              "name": "budget",
              "required": false,
              "kind": "json",
              "description": "Optional snapshot size bounds. Defaults to the engine limits."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_wcc\",\"graph\":\"social\",\"budget\":{\"max_nodes\":1000,\"max_edges\":1000}}"
  },
  "graph.apply_delete_policy": {
      "fields": [
          {
              "name": "policy",
              "required": true,
              "kind": "json",
              "description": "Policy to apply: `cascade`, `detach`, or `keep_dangling`."
          },
          {
              "name": "target",
              "required": true,
              "kind": "json",
              "description": "The bound entity target."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_apply_delete_policy\",\"target\":{\"primitive\":\"kv\",\"space\":\"default\",\"key\":\"user:alice\"},\"policy\":\"detach\"}"
  },
  "graph.batch_write": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "operations",
              "required": true,
              "kind": "json",
              "description": "Batch operations."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_batch_write\",\"graph\":\"social\",\"operations\":[{\"type\":\"upsert_node\",\"node_id\":\"bw1\",\"data\":{}},{\"type\":\"upsert_node\",\"node_id\":\"bw2\",\"data\":{\"properties\":{\"team\":\"core\"}}},{\"type\":\"upsert_edge\",\"src\":\"bw1\",\"edge_type\":\"link\",\"dst\":\"bw2\",\"data\":{\"weight\":2}}]}"
  },
  "graph.bindings": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional exclusive cursor."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          },
          {
              "name": "target",
              "required": true,
              "kind": "json",
              "description": "Entity target to search for."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_bindings_for_entity\",\"target\":{\"primitive\":\"kv\",\"space\":\"default\",\"key\":\"user:alice\"}}"
  },
  "graph.bulk_insert": {
      "fields": [
          {
              "name": "chunk_size",
              "required": false,
              "kind": "number",
              "description": "Optional items-per-commit chunk size. Defaults to 512;"
          },
          {
              "name": "edges",
              "required": false,
              "kind": "json",
              "description": "Edges to upsert; endpoints must exist or arrive in `nodes`."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "nodes",
              "required": false,
              "kind": "json",
              "description": "Nodes to upsert (committed before edges)."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_bulk_insert\",\"graph\":\"social\",\"nodes\":[{\"node_id\":\"n1\",\"properties\":{\"kind\":\"a\"}},{\"node_id\":\"n2\"},{\"node_id\":\"n3\"}],\"edges\":[{\"src\":\"n1\",\"edge_type\":\"link\",\"dst\":\"n2\",\"weight\":1.5},{\"src\":\"n2\",\"edge_type\":\"link\",\"dst\":\"n3\"}]}"
  },
  "graph.create": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_create\",\"graph\":\"social\"}"
  },
  "graph.delete": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_delete\",\"graph\":\"social\"}"
  },
  "graph.edge.add": {
      "fields": [
          {
              "name": "dst",
              "required": true,
              "kind": "string",
              "description": "Destination node id."
          },
          {
              "name": "edge_type",
              "required": true,
              "kind": "string",
              "description": "Edge type."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "properties",
              "required": false,
              "kind": "json",
              "description": "Optional edge properties."
          },
          {
              "name": "src",
              "required": true,
              "kind": "string",
              "description": "Source node id."
          },
          {
              "name": "weight",
              "required": false,
              "kind": "number",
              "description": "Optional edge weight. Defaults to 1.0."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_add_edge\",\"graph\":\"social\",\"src\":\"alice\",\"edge_type\":\"follows\",\"dst\":\"bob\",\"properties\":{\"since\":2021}}"
  },
  "graph.edge.get": {
      "fields": [
          {
              "name": "dst",
              "required": true,
              "kind": "string",
              "description": "Destination node id."
          },
          {
              "name": "edge_type",
              "required": true,
              "kind": "string",
              "description": "Edge type."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "src",
              "required": true,
              "kind": "string",
              "description": "Source node id."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_get_edge\",\"graph\":\"social\",\"src\":\"alice\",\"edge_type\":\"follows\",\"dst\":\"bob\"}"
  },
  "graph.edge.remove": {
      "fields": [
          {
              "name": "dst",
              "required": true,
              "kind": "string",
              "description": "Destination node id."
          },
          {
              "name": "edge_type",
              "required": true,
              "kind": "string",
              "description": "Edge type."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "src",
              "required": true,
              "kind": "string",
              "description": "Source node id."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_remove_edge\",\"graph\":\"social\",\"src\":\"alice\",\"edge_type\":\"follows\",\"dst\":\"bob\"}"
  },
  "graph.list": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional exclusive graph cursor."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_list\",\"limit\":10}"
  },
  "graph.meta": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_get_meta\",\"graph\":\"social\"}"
  },
  "graph.neighbors": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional exclusive cursor."
          },
          {
              "name": "direction",
              "required": true,
              "kind": "json",
              "description": "Traversal direction."
          },
          {
              "name": "edge_type",
              "required": false,
              "kind": "string",
              "description": "Optional edge type filter."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          },
          {
              "name": "node_id",
              "required": true,
              "kind": "string",
              "description": "Node id."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_neighbors\",\"graph\":\"social\",\"node_id\":\"alice\",\"direction\":\"outgoing\",\"limit\":10}"
  },
  "graph.node.add": {
      "fields": [
          {
              "name": "binding",
              "required": false,
              "kind": "json",
              "description": "Optional entity binding."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "node_id",
              "required": true,
              "kind": "string",
              "description": "Node id."
          },
          {
              "name": "object_type",
              "required": false,
              "kind": "string",
              "description": "Optional declared object type (validated once the ontology is frozen)."
          },
          {
              "name": "properties",
              "required": false,
              "kind": "json",
              "description": "Optional node properties."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_add_node\",\"graph\":\"social\",\"node_id\":\"alice\",\"properties\":{\"name\":\"Alice\",\"role\":\"eng\"},\"object_type\":\"Person\"}"
  },
  "graph.node.get": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "node_id",
              "required": true,
              "kind": "string",
              "description": "Node id."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_get_node\",\"graph\":\"social\",\"node_id\":\"alice\"}"
  },
  "graph.node.list": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional exclusive node id cursor."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "string",
              "description": "Optional node id prefix."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_list_nodes\",\"graph\":\"social\",\"limit\":2}"
  },
  "graph.node.remove": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "node_id",
              "required": true,
              "kind": "string",
              "description": "Node id."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_remove_node\",\"graph\":\"social\",\"node_id\":\"alice\"}"
  },
  "graph.nodes_by_type": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional exclusive node id cursor."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          },
          {
              "name": "object_type",
              "required": true,
              "kind": "string",
              "description": "Object type name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_nodes_by_type\",\"graph\":\"social\",\"object_type\":\"Person\",\"limit\":2}"
  },
  "graph.ontology.define_link_type": {
      "fields": [
          {
              "name": "cardinality",
              "required": false,
              "kind": "string",
              "description": "Optional cardinality: one of `one-to-one`, `one-to-many`,"
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "name",
              "required": true,
              "kind": "string",
              "description": "Link type name."
          },
          {
              "name": "properties",
              "required": false,
              "kind": "json",
              "description": "Declared properties by name."
          },
          {
              "name": "source",
              "required": true,
              "kind": "string",
              "description": "Declared source object type."
          },
          {
              "name": "target",
              "required": true,
              "kind": "string",
              "description": "Declared target object type."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_define_link_type\",\"graph\":\"social\",\"name\":\"follows\",\"source\":\"Person\",\"target\":\"Person\",\"cardinality\":\"many-to-many\"}"
  },
  "graph.ontology.define_object_type": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "name",
              "required": true,
              "kind": "string",
              "description": "Object type name."
          },
          {
              "name": "properties",
              "required": false,
              "kind": "json",
              "description": "Declared properties by name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_define_object_type\",\"graph\":\"social\",\"name\":\"Person\",\"properties\":{\"name\":{\"value_type\":\"string\",\"required\":true},\"level\":{\"value_type\":\"integer\",\"required\":false}}}"
  },
  "graph.ontology.delete_link_type": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "name",
              "required": true,
              "kind": "string",
              "description": "Link type name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_delete_link_type\",\"graph\":\"social\",\"name\":\"knows\"}"
  },
  "graph.ontology.delete_object_type": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          },
          {
              "name": "name",
              "required": true,
              "kind": "string",
              "description": "Object type name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_delete_object_type\",\"graph\":\"social\",\"name\":\"Robot\"}"
  },
  "graph.ontology.freeze": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_freeze_ontology\",\"graph\":\"social\"}"
  },
  "graph.ontology.get": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_get_ontology\",\"graph\":\"social\"}"
  },
  "graph.ontology.summary": {
      "fields": [
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_ontology_summary\",\"graph\":\"social\"}"
  },
  "graph.sample": {
      "fields": [
          {
              "name": "count",
              "required": false,
              "kind": "number",
              "description": "Optional sample count. Defaults to 10."
          },
          {
              "name": "graph",
              "required": true,
              "kind": "string",
              "description": "Graph name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"graph_sample\",\"graph\":\"social\",\"count\":5}"
  },
  "inference.cache_status": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_cache_status\"}"
  },
  "inference.capability": {
      "fields": [
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_model_capability\",\"model\":\"anthropic:claude-3-5-haiku-latest\"}"
  },
  "inference.detokenize": {
      "fields": [
          {
              "name": "ids",
              "required": true,
              "kind": "json",
              "description": "Token ids."
          },
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_detokenize\",\"model\":\"fake-generate\",\"ids\":[104,101,108,108,111]}"
  },
  "inference.embed": {
      "fields": [
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec."
          },
          {
              "name": "request",
              "required": true,
              "kind": "json",
              "description": "Embedding request."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_embed\",\"model\":\"miniLM\",\"request\":{\"input\":\"hello world\"}}"
  },
  "inference.generate": {
      "fields": [
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec."
          },
          {
              "name": "request",
              "required": true,
              "kind": "json",
              "description": "Generation request."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_generate\",\"model\":\"anthropic:claude-3-5-haiku-latest\",\"request\":{\"prompt\":\"Write a haiku about databases.\",\"max_tokens\":64,\"temperature\":0}}"
  },
  "inference.models.list": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_models_list\"}"
  },
  "inference.models.local": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_models_local\"}"
  },
  "inference.models.pull": {
      "fields": [
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec or catalog name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_models_pull\",\"model\":\"miniLM\"}"
  },
  "inference.rank": {
      "fields": [
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec."
          },
          {
              "name": "request",
              "required": true,
              "kind": "json",
              "description": "Ranking request."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_rank\",\"model\":\"jina-reranker-v1-tiny\",\"request\":{\"query\":\"vector database\",\"passages\":[\"Strata stores embeddings for retrieval.\",\"The weather is sunny today.\"]}}"
  },
  "inference.tokenize": {
      "fields": [
          {
              "name": "add_special",
              "required": false,
              "kind": "boolean",
              "description": "Whether to add special tokens."
          },
          {
              "name": "model",
              "required": true,
              "kind": "string",
              "description": "Model spec."
          },
          {
              "name": "text",
              "required": true,
              "kind": "string",
              "description": "Text to tokenize."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_tokenize\",\"model\":\"tinyllama\",\"text\":\"hello world\",\"add_special\":false}"
  },
  "inference.unload": {
      "fields": [
          {
              "name": "model",
              "required": false,
              "kind": "string",
              "description": "Optional model spec."
          }
      ],
      "takesAsOf": false,
      "takesBranch": false,
      "takesSpace": false,
      "example": "{\"type\":\"inference_unload\"}"
  },
  "json.batch_delete": {
      "fields": [
          {
              "name": "entries",
              "required": true,
              "kind": "json",
              "description": "Entries to delete."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_batch_delete\",\"entries\":[{\"key\":\"user:ada\",\"path\":\"$\"},{\"key\":\"user:missing\",\"path\":\"$\"}]}"
  },
  "json.batch_exists": {
      "fields": [
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Document keys to check."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_batch_exists\",\"keys\":[\"user:ada\",\"user:missing\"]}"
  },
  "json.batch_get": {
      "fields": [
          {
              "name": "entries",
              "required": true,
              "kind": "json",
              "description": "Entries to read."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_batch_get\",\"entries\":[{\"key\":\"user:ada\",\"path\":\"$.name\"},{\"key\":\"user:missing\",\"path\":\"$\"}]}"
  },
  "json.batch_set": {
      "fields": [
          {
              "name": "entries",
              "required": true,
              "kind": "json",
              "description": "Entries to set."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_batch_set\",\"entries\":[{\"key\":\"user:ada\",\"path\":\"$\",\"value\":{\"name\":\"Ada\"}},{\"key\":\"user:grace\",\"path\":\"$\",\"value\":{\"name\":\"Grace\"}}]}"
  },
  "json.count": {
      "fields": [
          {
              "name": "prefix",
              "required": false,
              "kind": "string",
              "description": "Optional document key prefix."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_count\",\"prefix\":\"user:\"}"
  },
  "json.delete": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Document key."
          },
          {
              "name": "path",
              "required": true,
              "kind": "string",
              "description": "JSON path."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_delete\",\"key\":\"user:ada\",\"path\":\"$\"}"
  },
  "json.exists": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Document key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_exists\",\"key\":\"user:ada\"}"
  },
  "json.get": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Document key."
          },
          {
              "name": "path",
              "required": true,
              "kind": "string",
              "description": "JSON path."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_get\",\"key\":\"user:ada\",\"path\":\"$\"}"
  },
  "json.history": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Document key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_history\",\"key\":\"user:ada\"}"
  },
  "json.index.create": {
      "fields": [
          {
              "name": "field_path",
              "required": true,
              "kind": "string",
              "description": "Indexed field path."
          },
          {
              "name": "index_type",
              "required": true,
              "kind": "json",
              "description": "Index kind."
          },
          {
              "name": "name",
              "required": true,
              "kind": "string",
              "description": "Index name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_create_index\",\"name\":\"by_name\",\"field_path\":\"$.name\",\"index_type\":\"tag\"}"
  },
  "json.index.drop": {
      "fields": [
          {
              "name": "name",
              "required": true,
              "kind": "string",
              "description": "Index name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_drop_index\",\"name\":\"by_name\"}"
  },
  "json.index.list": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_list_indexes\"}"
  },
  "json.list": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional document key cursor."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "string",
              "description": "Optional document key prefix."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_list\",\"prefix\":\"user:\",\"limit\":1}"
  },
  "json.sample": {
      "fields": [
          {
              "name": "count",
              "required": false,
              "kind": "number",
              "description": "Optional sample count. Defaults to 10."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "string",
              "description": "Optional document key prefix."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_sample\",\"prefix\":\"user:\",\"count\":5}"
  },
  "json.scan": {
      "fields": [
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional row limit."
          },
          {
              "name": "start",
              "required": false,
              "kind": "string",
              "description": "Optional inclusive start document key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_scan\",\"start\":\"user:\",\"limit\":10}"
  },
  "json.set": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Document key."
          },
          {
              "name": "path",
              "required": true,
              "kind": "string",
              "description": "JSON path."
          },
          {
              "name": "value",
              "required": true,
              "kind": "json",
              "description": "JSON value."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"json_set\",\"key\":\"user:ada\",\"path\":\"$\",\"value\":{\"name\":\"Ada\"}}"
  },
  "kv.batch_delete": {
      "fields": [
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Keys to delete."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_batch_delete\",\"keys\":[\"YQ==\",\"bWlzc2luZw==\"]}"
  },
  "kv.batch_exists": {
      "fields": [
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Keys to check."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_batch_exists\",\"keys\":[\"YQ==\",\"bWlzc2luZw==\"]}"
  },
  "kv.batch_get": {
      "fields": [
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Keys to read."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_batch_get\",\"keys\":[\"YQ==\",\"bWlzc2luZw==\"]}"
  },
  "kv.batch_put": {
      "fields": [
          {
              "name": "entries",
              "required": true,
              "kind": "json",
              "description": "Entries to write."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_batch_put\",\"entries\":[{\"key\":\"YQ==\",\"value\":\"b25l\"}]}"
  },
  "kv.count": {
      "fields": [
          {
              "name": "prefix",
              "required": false,
              "kind": "bytes",
              "description": "Optional key prefix."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_count\",\"prefix\":\"YQ==\"}"
  },
  "kv.delete": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "bytes",
              "description": "Key bytes."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_delete\",\"key\":\"YQ==\"}"
  },
  "kv.exists": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "bytes",
              "description": "Key to check."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_exists\",\"key\":\"YQ==\"}"
  },
  "kv.get": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "bytes",
              "description": "Key bytes."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_get\",\"key\":\"YQ==\",\"as_of\":3}"
  },
  "kv.history": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "bytes",
              "description": "Key to read."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_history\",\"key\":\"YQ==\"}"
  },
  "kv.list": {
      "fields": [
          {
              "name": "cursor",
              "required": false,
              "kind": "bytes",
              "description": "Optional key cursor."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "bytes",
              "description": "Optional key prefix."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_list\",\"prefix\":\"YQ==\",\"limit\":2}"
  },
  "kv.put": {
      "fields": [
          {
              "name": "key",
              "required": true,
              "kind": "bytes",
              "description": "Key bytes."
          },
          {
              "name": "value",
              "required": true,
              "kind": "bytes",
              "description": "Value bytes."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_put\",\"key\":\"YQ==\",\"value\":\"b25l\"}"
  },
  "kv.sample": {
      "fields": [
          {
              "name": "count",
              "required": false,
              "kind": "number",
              "description": "Optional sample count. Defaults to 10."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "bytes",
              "description": "Optional key prefix."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_sample\",\"prefix\":\"YQ==\",\"count\":4}"
  },
  "kv.scan": {
      "fields": [
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional row limit."
          },
          {
              "name": "start",
              "required": false,
              "kind": "bytes",
              "description": "Optional inclusive start key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"kv_scan\",\"start\":\"YQ==\",\"limit\":10}"
  },
  "space.create": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"space_create\",\"space\":\"tenant_a\"}"
  },
  "space.delete": {
      "fields": [
          {
              "name": "force",
              "required": false,
              "kind": "boolean",
              "description": "Delete visible data in the space before dropping the catalog entry."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"space_delete\",\"space\":\"tenant_a\"}"
  },
  "space.exists": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"space_exists\",\"space\":\"tenant_a\"}"
  },
  "space.list": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": false,
      "example": "{\"type\":\"space_list\"}"
  },
  "vector.batch_delete": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Keys to delete."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_batch_delete\",\"collection\":\"docs\",\"keys\":[\"doc-a\",\"missing\"]}"
  },
  "vector.batch_exists": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Vector keys to check."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_batch_exists\",\"collection\":\"docs\",\"keys\":[\"doc-a\",\"missing\"]}"
  },
  "vector.batch_get": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "keys",
              "required": true,
              "kind": "json",
              "description": "Keys to read."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_batch_get\",\"collection\":\"docs\",\"keys\":[\"doc-a\",\"missing\"]}"
  },
  "vector.batch_upsert": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "entries",
              "required": true,
              "kind": "json",
              "description": "Entries to write."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_batch_upsert\",\"collection\":\"docs\",\"entries\":[{\"key\":\"doc-a\",\"vector\":[1,0],\"metadata\":{\"kind\":\"doc\"}}]}"
  },
  "vector.collection.create": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "dimension",
              "required": true,
              "kind": "number",
              "description": "Embedding dimension."
          },
          {
              "name": "metric",
              "required": true,
              "kind": "json",
              "description": "Distance metric."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_create_collection\",\"collection\":\"docs\",\"dimension\":2,\"metric\":\"cosine\"}"
  },
  "vector.collection.delete": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_delete_collection\",\"collection\":\"docs\"}"
  },
  "vector.collection.list": {
      "fields": [],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_list_collections\"}"
  },
  "vector.collection.stats": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_collection_stats\",\"collection\":\"docs\"}"
  },
  "vector.count": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_count\",\"collection\":\"docs\"}"
  },
  "vector.delete": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Vector key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_delete\",\"collection\":\"docs\",\"key\":\"doc-a\"}"
  },
  "vector.delete_all": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_delete_all\",\"collection\":\"docs\"}"
  },
  "vector.delete_by_filter": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "filter",
              "required": true,
              "kind": "json",
              "description": "Metadata filter."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_delete_by_filter\",\"collection\":\"docs\",\"filter\":{\"conditions\":[{\"field\":\"kind\",\"op\":\"eq\",\"value\":{\"type\":\"string\",\"value\":\"doc\"}}]}}"
  },
  "vector.exists": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Vector key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_exists\",\"collection\":\"docs\",\"key\":\"doc-a\"}"
  },
  "vector.get": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Vector key."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_get\",\"collection\":\"docs\",\"key\":\"doc-a\"}"
  },
  "vector.history": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Vector key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_history\",\"collection\":\"docs\",\"key\":\"doc-a\"}"
  },
  "vector.index.query": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "filter",
              "required": false,
              "kind": "json",
              "description": "Optional metadata filter."
          },
          {
              "name": "k",
              "required": true,
              "kind": "number",
              "description": "Maximum number of matches."
          },
          {
              "name": "query",
              "required": true,
              "kind": "json",
              "description": "Query embedding. Accepted at wire (f64) precision and narrowed to the"
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_index_query\",\"collection\":\"docs\",\"query\":[1,0],\"k\":10,\"filter\":{\"conditions\":[{\"field\":\"kind\",\"op\":\"eq\",\"value\":{\"type\":\"string\",\"value\":\"doc\"}}]}}"
  },
  "vector.keys": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "cursor",
              "required": false,
              "kind": "string",
              "description": "Optional key cursor."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional item limit. Defaults to 100."
          },
          {
              "name": "prefix",
              "required": false,
              "kind": "string",
              "description": "Optional key prefix."
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_list_keys\",\"collection\":\"docs\",\"prefix\":\"doc-\",\"limit\":2}"
  },
  "vector.metadata.update": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Vector key."
          },
          {
              "name": "patch",
              "required": true,
              "kind": "json",
              "description": "Top-level metadata patch."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_update_metadata\",\"collection\":\"docs\",\"key\":\"doc-a\",\"patch\":{\"rank\":2}}"
  },
  "vector.query": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "filter",
              "required": false,
              "kind": "json",
              "description": "Optional metadata filter."
          },
          {
              "name": "k",
              "required": true,
              "kind": "number",
              "description": "Maximum number of matches."
          },
          {
              "name": "query",
              "required": true,
              "kind": "json",
              "description": "Query embedding. Accepted at wire (f64) precision and narrowed to the"
          }
      ],
      "takesAsOf": true,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_query\",\"collection\":\"docs\",\"query\":[1,0],\"k\":10,\"filter\":{\"conditions\":[{\"field\":\"kind\",\"op\":\"eq\",\"value\":{\"type\":\"string\",\"value\":\"doc\"}}]}}"
  },
  "vector.sample": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "count",
              "required": false,
              "kind": "number",
              "description": "Optional sample count. Defaults to 10."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_sample\",\"collection\":\"docs\",\"count\":5}"
  },
  "vector.scan": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "limit",
              "required": false,
              "kind": "number",
              "description": "Optional row limit."
          },
          {
              "name": "start",
              "required": false,
              "kind": "string",
              "description": "Optional inclusive start key."
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_scan\",\"collection\":\"docs\",\"start\":\"doc-\",\"limit\":10}"
  },
  "vector.upsert": {
      "fields": [
          {
              "name": "collection",
              "required": true,
              "kind": "string",
              "description": "Collection name."
          },
          {
              "name": "key",
              "required": true,
              "kind": "string",
              "description": "Vector key."
          },
          {
              "name": "metadata",
              "required": false,
              "kind": "json",
              "description": "Optional metadata."
          },
          {
              "name": "vector",
              "required": true,
              "kind": "json",
              "description": "Dense embedding. Accepted at wire (f64) precision and narrowed to the"
          }
      ],
      "takesAsOf": false,
      "takesBranch": true,
      "takesSpace": true,
      "example": "{\"type\":\"vector_upsert\",\"collection\":\"docs\",\"key\":\"doc-a\",\"vector\":[1,0],\"metadata\":{\"kind\":\"doc\"}}"
  },
};
