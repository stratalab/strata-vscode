export const DEFAULT_HUB_URL = "https://hub.stratahub.io/";

export type HubPrimitive = "kv" | "json" | "vectors" | "events" | "branches";
export type HubSort = "downloads" | "recent" | "name" | "size";

export interface HubInfo {
  protocol_version: string;
  server_implementation: string;
  server_version: string;
  hash_algorithm: string;
  max_object_size_bytes: number;
  max_manifest_size_bytes: number;
  max_dataset_size_bytes: number;
  supported_object_content_types: string[];
  telemetry_endpoint_enabled: boolean;
}

export interface DatasetSummary {
  name: string;
  description: string;
  size_bytes: number;
  downloads: number;
  primitives: HubPrimitive[];
  tasks: string[];
  tags: string[];
  license: string;
  default_branch: string;
  last_updated: string;
  badge?: "official" | "community";
}

export interface DatasetListResponse extends PaginationEnvelope<DatasetSummary> {
  facets?: DatasetFacets;
}

export interface DatasetFacets {
  scope: "filtered";
  primitives: FacetCount[];
  tasks: FacetCount[];
  tags: FacetCount[];
  licenses: FacetCount[];
  badges: FacetCount[];
  size_buckets: SizeBucketFacet[];
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface SizeBucketFacet {
  bucket:
    | "zero"
    | "under1mib"
    | "1mib_to_10mib"
    | "10mib_to_100mib"
    | "100mib_to_1gib"
    | "over1gib";
  count: number;
}

export interface DatasetCard extends DatasetSummary {
  owner: string;
  summary_excerpt: string;
  created: string;
  manifest_hash: string;
  engine_version_required: string;
  format_version: string;
  capability_registry_version: number;
  clone_command: string;
  readme: string;
  quick_start_snippets: Record<string, string>;
  frontmatter_extras: Record<string, unknown>;
  sample_preview?: SamplePreview;
  schema?: DatasetSchema;
  strata_features?: StrataFeatures;
  citation?: string;
  provenance?: Provenance;
}

export interface SamplePreview {
  kv?: Array<{ key: string; value_summary: string }>;
  json?: Array<{ path: string; example_value: unknown }>;
  vectors?: Array<{
    collection: string;
    dimension: number;
    example_metadata: Record<string, unknown>;
    vector_preview: number[];
  }>;
  events?: Array<{ stream: string; timestamp: string; event_summary: string }>;
  branches?: Array<{ name: string; created: string; is_default: boolean }>;
}

export interface DatasetSchema {
  kv?: { namespaces: Array<{ prefix: string; value_type: string; entry_count: number }> };
  json?: { fields: Record<string, string> };
  vectors?: { collections: Array<{ name: string; dimension: number; count: number; metric: string }> };
  events?: { streams: Array<{ name: string; event_shape: unknown }> };
}

export interface StrataFeatures {
  branches: Array<{ name: string; is_default: boolean }>;
  time_travel_highlights: string[];
  multi_primitive_demos: string[];
  example_notebook?: string;
}

export interface Provenance {
  source: string;
  curator: string;
  license_text_url?: string;
}

export interface RefList {
  dataset: string;
  default_branch: string;
  refs: Array<{ branch: string; manifest_hash: string; last_updated: string }>;
}

export interface PaginationEnvelope<T> {
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

export interface DatasetListParams {
  query?: string | null;
  tasks?: string[];
  tags?: string[];
  primitives?: HubPrimitive[];
  license?: string | null;
  sizeMinBytes?: number | null;
  sizeMaxBytes?: number | null;
  sort?: HubSort;
  includeFacets?: boolean;
  limit?: number;
  offset?: number;
}

export interface EffectiveHub {
  url: string;
  source: string;
  warning?: string;
  overridden: boolean;
}

export class HubApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class HubApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  info(): Promise<HubInfo> {
    return this.getJson<HubInfo>("/v1/info");
  }

  listDatasets(params: DatasetListParams): Promise<DatasetListResponse> {
    return this.getJson<DatasetListResponse>(
      `/v1/datasets${datasetListQuery(params)}`,
    );
  }

  getDataset(name: string): Promise<DatasetCard> {
    return this.getJson<DatasetCard>(`/v1/datasets/${encodeURIComponent(name)}`);
  }

  listRefs(name: string): Promise<RefList> {
    return this.getJson<RefList>(`/v1/datasets/${encodeURIComponent(name)}/refs`);
  }

  yanked(since?: string): Promise<unknown> {
    const query = since ? `?since=${encodeURIComponent(since)}` : "";
    return this.getJson<unknown>(`/v1/yanked${query}`);
  }

  private async getJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(hubEndpointUrl(this.baseUrl, path), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new HubApiError(
        aborted ? "Hub request timed out." : `Hub request failed: ${String(error)}`,
        null,
        null,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    if (!response.ok) {
      const problem = parseJsonObject(text);
      const code = stringField(problem, "code") ?? stringField(problem, "type");
      const detail = stringField(problem, "detail") ?? stringField(problem, "message");
      throw new HubApiError(
        detail ?? `Hub returned HTTP ${response.status}.`,
        response.status,
        code,
        response.status >= 500 || response.status === 429,
      );
    }
    const parsed = parseJsonObject(text);
    if (!parsed) throw new HubApiError("Hub returned invalid JSON.", response.status, null, true);
    return parsed as T;
  }
}

export function datasetListQuery(params: DatasetListParams): string {
  const query = new URLSearchParams();
  if (params.query?.trim()) query.set("q", params.query.trim());
  for (const task of params.tasks ?? []) if (task) query.append("task", task);
  for (const tag of params.tags ?? []) if (tag) query.append("tag", tag);
  for (const primitive of params.primitives ?? []) query.append("primitive", primitive);
  if (params.license) query.set("license", params.license);
  if (params.sizeMinBytes !== undefined && params.sizeMinBytes !== null) {
    query.set("size_min_bytes", String(params.sizeMinBytes));
  }
  if (params.sizeMaxBytes !== undefined && params.sizeMaxBytes !== null) {
    query.set("size_max_bytes", String(params.sizeMaxBytes));
  }
  if (params.sort) query.set("sort", params.sort);
  if (params.includeFacets) query.set("include_facets", "true");
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const rendered = query.toString();
  return rendered ? `?${rendered}` : "";
}

export function hubEndpointUrl(baseUrl: string, path: string): string {
  const base = new URL(normalizeHubUrl(baseUrl));
  const [endpointPath = "", endpointSearch = ""] = path.replace(/^\/+/, "").split("?", 2);
  const basePath = base.pathname.replace(/\/+$/, "");
  const pathWithoutDuplicateVersion =
    basePath.endsWith("/v1") && endpointPath.startsWith("v1/") ? endpointPath.slice(3) : endpointPath;
  const joined = [basePath, pathWithoutDuplicateVersion].filter(Boolean).join("/");
  base.pathname = joined.startsWith("/") ? joined : `/${joined}`;
  base.search = endpointSearch ? `?${endpointSearch}` : "";
  base.hash = "";
  return base.toString();
}

export function normalizeHubUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Hub URL is empty.");
  const withScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Hub URL must use http or https.");
  }
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.startsWith("{")) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}
