/**
 * Unified space browser: one Redis-style list for the data in a branch/space,
 * with type filters when the user wants to narrow to one Strata primitive.
 */
import { byteEl, clear, flashCopied, h, preservingScroll, timeEl } from "./shared/dom";
import { emptyState, loadingState, requestFailed } from "./shared/states";
import { formatCount, formatHexDump } from "./shared/format";
import { scopeBanner } from "./shared/banner";
import { jsonTree } from "./shared/jsonTree";
import { strataRail } from "./shared/rail";
import type { ViewRpc } from "./shared/rpc";
import type {
  GraphExpandData,
  GraphOntologyData,
  JsonDocData,
  KvValueData,
  SpaceFilter,
  SpaceItem,
  SpacePageData,
  TimelineData,
  VectorPageData,
  ViewFocus,
} from "./shared/messages";

const FILTERS: Array<{ value: SpaceFilter; label: string; icon: string }> = [
  { value: "all", label: "All", icon: "list-flat" },
  { value: "kv", label: "Keys", icon: "symbol-key" },
  { value: "json", label: "Documents", icon: "json" },
  { value: "events", label: "Events", icon: "pulse" },
  { value: "vectors", label: "Vectors", icon: "symbol-array" },
  { value: "graphs", label: "Graphs", icon: "type-hierarchy" },
];

type Detail =
  | { kind: "kv"; value: KvValueData; timeline: TimelineData }
  | { kind: "json"; doc: JsonDocData; timeline: TimelineData }
  | { kind: "event" }
  | { kind: "vector"; page: VectorPageData }
  | { kind: "graph"; ontology: GraphOntologyData | null; seed: GraphExpandData };

export class SpaceBrowserView {
  private rows: SpaceItem[] = [];
  private cursor: string | null = null;
  private hasMore = false;
  private total: number | null = null;
  private notes: string[] = [];
  private filter: SpaceFilter = "all";
  private keyFilter = "";
  private selected: SpaceItem | null = null;
  private detail: Detail | null = null;
  private pendingFocus: SpaceItem | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
    initialFocus: ViewFocus | null = null,
  ) {
    this.pendingFocus = initialFocus?.type === "space-item" ? initialFocus.item : null;
    rpc.onScopeChange(() => void this.reload());
  }

  async reload(): Promise<void> {
    const focus = this.pendingFocus;
    this.pendingFocus = null;
    this.rows = [];
    this.cursor = null;
    this.selected = null;
    this.detail = null;
    if (!this.root.hasChildNodes()) this.renderLoading();
    await this.loadPage(null, true);
    if (focus) {
      this.selected = focus;
      await this.select(focus);
    }
  }

  async focus(focus: ViewFocus): Promise<void> {
    if (focus.type !== "space-item") return;
    this.pendingFocus = focus.item;
    await this.reload();
  }

  private backToNow(): (() => void) | null {
    return this.rpc.scope?.asOfLabel
      ? () => void this.rpc.request({ op: "scrub", micros: null })
      : null;
  }

  private renderLoading(): void {
    clear(this.root);
    this.root.append(loadingState(this.rpc.scope!, this.backToNow()));
  }

  private async loadPage(cursor: string | null, replace = false): Promise<void> {
    try {
      const page = await this.rpc.request<SpacePageData>({
        op: "space-page",
        filter: this.filter,
        cursor,
      });
      this.rows = replace ? page.items : [...this.rows, ...page.items];
      this.cursor = page.cursor;
      this.hasMore = page.hasMore;
      this.total = page.total;
      this.notes = page.notes;
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  render(): void {
    preservingScroll(this.root, () => this.renderContent());
  }

  private renderContent(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    if (this.rows.length === 0 && !this.hasMore && !this.keyFilter.trim()) {
      this.root.append(
        scopeBanner(scope, null, this.backToNow()),
        this.toolbar(),
        emptyState(
          "symbol-namespace",
          "No data in this space yet",
          "Data written by the owning app appears here the moment it lands.",
        ),
      );
      return;
    }

    const visibleRows = this.visibleRows();
    const facts = this.keyFilter.trim()
      ? `${formatCount(visibleRows.length)} shown matching "${this.keyFilter.trim()}" of ${formatCount(this.rows.length)} loaded${this.hasMore ? " - next page available" : ""}`
      : `${formatCount(this.rows.length)} shown${this.total !== null ? ` of ${formatCount(this.total)}` : ""}${this.hasMore ? " - next page available" : ""}`;
    this.root.append(
      scopeBanner(scope, facts, this.backToNow()),
      this.toolbar(),
      ...this.notes.map((note) => h("div", { class: "space-note" }, note)),
      h(
        "div",
        { class: "space-browser" },
        h(
          "div",
          { class: "space-list" },
          this.tableEl(visibleRows),
          visibleRows.length === 0
            ? h("div", { class: "filter-empty" }, "No rows match this filter.")
            : null,
          this.hasMore
            ? h(
                "button",
                { class: "load-more", onclick: () => void this.loadPage(this.cursor) },
                `Load next page (${formatCount(this.rows.length)} loaded)`,
              )
            : null,
        ),
        h("div", { class: "detail" }, ...this.detailInner()),
      ),
    );
  }

  private toolbar(): HTMLElement {
    return h(
      "div",
      { class: "toolbar space-toolbar" },
      h(
        "div",
        { class: "segmented space-filters", role: "radiogroup", "aria-label": "Data type" },
        ...FILTERS.map((option) =>
          h(
            "button",
            {
              class: `seg${this.filter === option.value ? " active" : ""}`,
              role: "radio",
              "aria-checked": String(this.filter === option.value),
              title: option.label,
              onclick: () => {
                this.changeFilter(option.value);
              },
            },
            h("span", { class: `codicon codicon-${option.icon}`, "aria-hidden": "true" }),
            option.label,
          ),
        ),
      ),
      h(
        "div",
        { class: "key-find", role: "search" },
        h("span", { class: "codicon codicon-search", "aria-hidden": "true" }),
        h("input", {
          class: "key-filter",
          "aria-label": "Filter by key",
          placeholder: "Filter keys...",
          value: this.keyFilter,
          oninput: (e) => {
            this.keyFilter = (e.target as HTMLInputElement).value;
            this.clearHiddenSelection();
            this.render();
          },
        }),
      ),
    );
  }

  private changeFilter(filter: SpaceFilter): void {
    this.filter = filter;
    this.selected = null;
    this.detail = null;
    void this.loadPage(null, true);
  }

  private visibleRows(): SpaceItem[] {
    const needle = normalizeKeyFilter(this.keyFilter);
    if (!needle) return this.rows;
    return this.rows.filter((row) => normalizeKeyFilter(row.label).includes(needle));
  }

  private clearHiddenSelection(): void {
    if (!this.selected) return;
    if (this.visibleRows().some((row) => row.id === this.selected?.id)) return;
    this.selected = null;
    this.detail = null;
  }

  private tableEl(rows: SpaceItem[]): HTMLElement {
    const table = h(
      "table",
      { class: "space-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "type"), h("th", {}, "name"), h("th", {}, "preview"), h("th", {}, "version"))),
    );
    const body = h("tbody", {});
    for (const row of rows) {
      body.append(
        h(
          "tr",
          {
            class: row.id === this.selected?.id ? "selected" : "",
            tabindex: "0",
            "aria-label": `${row.kind} ${row.label}`,
            onclick: () => void this.select(row),
            onkeydown: (e) => {
              if ((e as KeyboardEvent).key === "Enter") void this.select(row);
            },
          },
          h("td", {}, typeCell(row)),
          h("td", { class: "cell-key" }, row.label),
          h("td", { class: "cell-preview" }, row.preview),
          h("td", { class: "cell-version" }, row.version === null ? "-" : String(row.version)),
        ),
      );
    }
    table.append(body);
    return h("div", { class: "table-scroll" }, table);
  }

  private async select(row: SpaceItem): Promise<void> {
    this.selected = row;
    this.detail = null;
    this.render();
    try {
      if (row.kind === "kv" && row.keyB64) {
        const [value, timeline] = await Promise.all([
          this.rpc.request<KvValueData>({ op: "kv-value", key: row.keyB64 }),
          this.rpc.request<TimelineData>({ op: "kv-history", key: row.keyB64 }),
        ]);
        this.detail = { kind: "kv", value, timeline };
      } else if (row.kind === "json" && row.docId) {
        const [doc, timeline] = await Promise.all([
          this.rpc.request<JsonDocData>({ op: "json-doc", docId: row.docId }),
          this.rpc.request<TimelineData>({ op: "json-history", docId: row.docId }),
        ]);
        this.detail = { kind: "json", doc, timeline };
      } else if (row.kind === "vector-collection" && row.collection) {
        const page = await this.rpc.request<VectorPageData>({ op: "vector-page", collection: row.collection });
        this.detail = { kind: "vector", page };
      } else if (row.kind === "graph" && row.graph) {
        const [ontology, seed] = await Promise.all([
          this.rpc.request<GraphOntologyData>({ op: "graph-ontology", graph: row.graph }).catch(() => null),
          this.rpc.request<GraphExpandData>({ op: "graph-seed", graph: row.graph, count: 10 }),
        ]);
        this.detail = { kind: "graph", ontology, seed };
      } else {
        this.detail = { kind: "event" };
      }
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  private detailInner(): HTMLElement[] {
    if (!this.selected) return [h("div", { class: "detail-empty" }, "Select a row")];
    if (!this.detail) return [h("div", { class: "detail-loading" }, "Loading...")];
    const row = this.selected;
    const head = h(
      "div",
      { class: "detail-head" },
      h("span", { class: `type-pill type-${row.kind}` }, typeLabel(row.kind)),
      h(
        "span",
        {
          class: "detail-key",
          title: "copy name",
          onclick: (e) => {
            void navigator.clipboard.writeText(row.label);
            flashCopied(e.currentTarget as HTMLElement);
          },
        },
        row.label,
      ),
      row.version === null ? null : h("span", { class: "chip" }, `v${row.version}`),
      row.timestamp === null ? null : timeEl(row.timestamp),
    );

    switch (this.detail.kind) {
      case "kv":
        return [head, ...this.kvDetail(this.detail.value), this.timelineEl(this.detail.timeline, "Scrub here")];
      case "json":
        return [head, this.jsonDocEl(this.detail.doc), this.timelineEl(this.detail.timeline, "Compare with current")];
      case "event":
        return [head, ...this.eventDetail(row)];
      case "vector":
        return [head, this.vectorDetail(this.detail.page)];
      case "graph":
        return [head, this.graphDetail(this.detail.ontology, this.detail.seed)];
    }
  }

  private kvDetail(value: KvValueData): HTMLElement[] {
    if (!value.found) return [h("div", { class: "detail-empty" }, "Not found at this position.")];
    const facts = h("div", { class: "detail-facts" }, byteEl(value.byteLength));
    if (value.json !== null) return [facts, jsonLikeValue(value.json)];
    if (value.text !== null) return [facts, h("pre", { class: "detail-text" }, value.text)];
    return [facts, h("pre", { class: "detail-hex" }, formatHexDump(value.hex))];
  }

  private jsonDocEl(doc: JsonDocData): HTMLElement {
    if (!doc.found) return h("div", { class: "detail-empty" }, "Document not found at this position.");
    return jsonTree(doc.value, "$", (p) => void navigator.clipboard.writeText(p));
  }

  private eventDetail(row: SpaceItem): HTMLElement[] {
    if (!row.event) return [h("div", { class: "detail-empty" }, "Event details unavailable.")];
    return [
      h("div", { class: "detail-facts" }, `sequence ${row.event.sequence}`),
      jsonTree(row.event.payload, "$.payload", (p) => void navigator.clipboard.writeText(p)),
      h("pre", { class: "detail-hex" }, `hash ${row.event.hash}\nprevious ${row.event.previousHash}`),
    ];
  }

  private vectorDetail(page: VectorPageData): HTMLElement {
    if (page.items.length === 0) return h("div", { class: "detail-empty" }, "This collection is empty.");
    const table = h(
      "table",
      { class: "vector-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "key"), h("th", {}, "dims"), h("th", {}, "norm"), h("th", {}, "metadata"))),
    );
    const body = h("tbody", {});
    for (const item of page.items) {
      body.append(
        h(
          "tr",
          {},
          h("td", {}, item.key),
          h("td", {}, String(item.dimension)),
          h("td", {}, item.norm.toFixed(4)),
          h("td", { class: "cell-preview" }, item.metadataPreview ?? "-"),
        ),
      );
    }
    table.append(body);
    return h("div", { class: "table-scroll" }, table);
  }

  private graphDetail(ontology: GraphOntologyData | null, seed: GraphExpandData): HTMLElement {
    return h(
      "div",
      { class: "graph-summary" },
      ontology
        ? h(
            "div",
            { class: "detail-facts" },
            `${ontology.status} · ${formatCount(ontology.objectTypes.length)} object types · ${formatCount(ontology.linkTypes.length)} link types`,
          )
        : null,
      jsonTree({ sampleNodes: seed.nodes, sampleEdges: seed.edges }, "$", (p) => void navigator.clipboard.writeText(p)),
    );
  }

  private timelineEl(timeline: TimelineData, verb: string): HTMLElement {
    if (timeline.kind === "unavailable") {
      return h("div", { class: "retention" }, `history unavailable: ${timeline.reason ?? ""}`);
    }
    return strataRail(timeline.entries, {
      title: "History",
      verb,
      activeMicros: this.rpc.scope?.asOfMicros ?? null,
      onPick: (entry) => void this.rpc.request({ op: "scrub", micros: entry.timestamp }),
    });
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, this.backToNow()),
      requestFailed(error, {
        what: "Couldn't load space data",
        onRetry: () => void this.reload(),
        onBackToNow: this.backToNow(),
        onOpenDocs: (code) => void this.rpc.request({ op: "open-docs", code }),
      }),
    );
  }
}

function typeCell(row: SpaceItem): HTMLElement {
  return h(
    "span",
    { class: `type-pill type-${row.kind}`, title: row.meta },
    h("span", { class: `codicon codicon-${typeIcon(row.kind)}`, "aria-hidden": "true" }),
    typeLabel(row.kind),
  );
}

function typeLabel(kind: SpaceItem["kind"]): string {
  switch (kind) {
    case "kv":
      return "KV";
    case "json":
      return "Doc";
    case "event":
      return "Event";
    case "vector-collection":
      return "Vector";
    case "graph":
      return "Graph";
  }
}

function typeIcon(kind: SpaceItem["kind"]): string {
  switch (kind) {
    case "kv":
      return "symbol-key";
    case "json":
      return "json";
    case "event":
      return "pulse";
    case "vector-collection":
      return "symbol-array";
    case "graph":
      return "type-hierarchy";
  }
}

function normalizeKeyFilter(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s._:-]+/g, "");
}

function jsonLikeValue(value: unknown): HTMLElement {
  if (isFieldRecord(value)) {
    const table = h("table", { class: "field-table" }, h("thead", {}, h("tr", {}, h("th", {}, "field"), h("th", {}, "value"))));
    const body = h("tbody", {});
    for (const [field, fieldValue] of Object.entries(value)) {
      body.append(h("tr", {}, h("td", { class: "cell-key" }, field), h("td", { class: "cell-preview" }, formatField(fieldValue))));
    }
    table.append(body);
    return h("div", {}, table, h("details", { class: "raw-json" }, h("summary", {}, "JSON"), jsonTree(value, "$", (p) => void navigator.clipboard.writeText(p))));
  }
  return jsonTree(value, "$", (p) => void navigator.clipboard.writeText(p));
}

function isFieldRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatField(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 120)}...` : text;
  } catch {
    return String(value);
  }
}
