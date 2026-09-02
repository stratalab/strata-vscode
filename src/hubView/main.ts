import codiconCss from "@vscode/codicons/dist/codicon.css";
import { clear, h } from "../views/shared/dom";
import { formatBytes, formatCount } from "../views/shared/format";
import type {
  DatasetCard,
  DatasetFacets,
  DatasetListParams,
  DatasetSummary,
  HubPrimitive,
  HubSort,
  RefList,
  SamplePreview,
} from "../hub/catalog";
import type {
  ExtToHub,
  HubBootstrapData,
  HubCloneData,
  HubCloneProgressData,
  HubDetailData,
  HubErrorShape,
  HubListData,
  HubViewOp,
} from "../hub/shared";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 180;
const CODICON_CLASSES = codiconCss.replace(/@font-face\s*\{[^}]*\}/, "");
const PRIMITIVES: Array<{ value: HubPrimitive; label: string; icon: string }> = [
  { value: "kv", label: "Keys", icon: "symbol-key" },
  { value: "json", label: "JSON", icon: "json" },
  { value: "vectors", label: "Vectors", icon: "symbol-array" },
  { value: "events", label: "Events", icon: "pulse" },
  { value: "branches", label: "Branches", icon: "git-branch" },
];
const SORTS: Array<{ value: HubSort; label: string; icon: string }> = [
  { value: "downloads", label: "Popular", icon: "flame" },
  { value: "recent", label: "Recent", icon: "history" },
  { value: "name", label: "Name", icon: "case-sensitive" },
  { value: "size", label: "Size", icon: "database" },
];

class HubRpc {
  private readonly vscode = acquireVsCodeApi();
  private nextReqId = 0;
  private readonly progressHandlers = new Set<(event: HubCloneProgressData) => void>();
  private readonly pending = new Map<
    number,
    { resolve: (data: unknown) => void; reject: (error: HubErrorShape) => void }
  >();

  constructor() {
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as ExtToHub;
      if (message.kind === "event") {
        if (message.event === "clone-progress") {
          for (const handler of this.progressHandlers) handler(message.data);
        }
        return;
      }
      if (message.kind !== "response") return;
      const waiter = this.pending.get(message.reqId);
      if (!waiter) return;
      this.pending.delete(message.reqId);
      if (message.ok) waiter.resolve(message.data);
      else waiter.reject(message.error);
    });
  }

  request<T>(payload: HubViewOp): Promise<T> {
    const reqId = ++this.nextReqId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve: resolve as (data: unknown) => void, reject });
      this.vscode.postMessage({ kind: "request", reqId, payload });
    });
  }

  onCloneProgress(handler: (event: HubCloneProgressData) => void): void {
    this.progressHandlers.add(handler);
  }
}

type DetailTab = "overview" | "preview" | "schema" | "readme";

class HubBrowserApp {
  private bootstrap: HubBootstrapData | null = null;
  private datasets: DatasetSummary[] = [];
  private total = 0;
  private offset = 0;
  private selected: string | null = null;
  private detail: HubDetailData | null = null;
  private loadingList = false;
  private loadingDetail = false;
  private listError: HubErrorShape | null = null;
  private detailError: HubErrorShape | null = null;
  private query = "";
  private primitives = new Set<HubPrimitive>();
  private tasks = new Set<string>();
  private tags = new Set<string>();
  private sort: HubSort = "downloads";
  private tab: DetailTab = "overview";
  private toast: string | null = null;
  private serverFacets: DatasetFacets | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private listRequestSeq = 0;
  private serverSearchSettledQuery: string | null = null;
  private cloning = false;
  private cloneProgress: HubCloneProgressData | null = null;
  private lastClone: HubCloneData | null = null;
  private lastProgressRender = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: HubRpc,
  ) {
    this.rpc.onCloneProgress((event) => this.receiveCloneProgress(event));
  }

  async start(): Promise<void> {
    this.renderShell();
    try {
      this.bootstrap = await this.rpc.request<HubBootstrapData>({ op: "bootstrap" });
      await this.loadList(true);
    } catch (error) {
      this.listError = error as HubErrorShape;
      this.renderShell();
    }
  }

  private async loadList(reset: boolean, force = false): Promise<void> {
    const requestSeq = ++this.listRequestSeq;
    const params = this.listParams(reset ? 0 : this.offset);
    this.loadingList = true;
    this.listError = null;
    if (reset) {
      this.datasets = [];
      this.offset = 0;
    }
    this.renderShell();
    try {
      const data = await this.rpc.request<HubListData>({
        op: "list",
        params,
        force,
      });
      if (requestSeq !== this.listRequestSeq) return;
      this.bootstrap = { ...(this.bootstrap ?? emptyBootstrap(data)), hub: data.hub };
      this.total = data.page.total;
      this.offset = data.page.offset + data.page.items.length;
      this.datasets = reset ? data.page.items : [...this.datasets, ...data.page.items];
      this.serverFacets = data.page.facets ?? null;
      const requestedQuery = params.query?.trim() || null;
      this.serverSearchSettledQuery = data.page.facets || !requestedQuery ? requestedQuery : null;
      if (!this.selected && this.datasets[0]) void this.selectDataset(this.datasets[0].name);
    } catch (error) {
      if (requestSeq !== this.listRequestSeq) return;
      this.listError = error as HubErrorShape;
    } finally {
      if (requestSeq === this.listRequestSeq) {
        this.loadingList = false;
        this.renderShell();
      }
    }
  }

  private async selectDataset(name: string, force = false): Promise<void> {
    this.selected = name;
    this.loadingDetail = true;
    this.detailError = null;
    this.detail = this.detail?.card.name === name && !force ? this.detail : null;
    this.tab = "overview";
    if (this.lastClone?.dataset !== name) this.lastClone = null;
    this.renderShell();
    try {
      this.detail = await this.rpc.request<HubDetailData>({ op: "detail", name, force });
    } catch (error) {
      this.detailError = error as HubErrorShape;
    } finally {
      this.loadingDetail = false;
      this.renderShell();
    }
  }

  private async refresh(): Promise<void> {
    this.detail = null;
    this.bootstrap = await this.rpc.request<HubBootstrapData>({ op: "bootstrap", force: true });
    await this.loadList(true, true);
  }

  private async changeHub(): Promise<void> {
    this.bootstrap = await this.rpc.request<HubBootstrapData>({ op: "change-hub" });
    this.detail = null;
    this.selected = null;
    await this.loadList(true, true);
  }

  private async useDefaultHub(): Promise<void> {
    this.bootstrap = await this.rpc.request<HubBootstrapData>({ op: "use-default-hub" });
    this.detail = null;
    this.selected = null;
    await this.loadList(true, true);
  }

  private async setGlobalHub(): Promise<void> {
    this.bootstrap = await this.rpc.request<HubBootstrapData>({ op: "set-global-hub" });
    this.detail = null;
    this.selected = null;
    await this.loadList(true, true);
  }

  private async cloneSelected(): Promise<void> {
    if (!this.detail) return;
    const branch = this.selectedBranch();
    this.cloning = true;
    this.cloneProgress = null;
    this.lastClone = null;
    this.detailError = null;
    this.renderShell();
    try {
      const result = await this.rpc.request<HubCloneData>({
        op: "clone",
        name: this.detail.card.name,
        branch,
      });
      if (result.cloned && result.dest) {
        this.lastClone = result;
        this.cloneProgress = {
          stage: "done",
          dataset: result.dataset,
          branch: result.branch,
          manifestHash: result.manifestHash,
          objectCount: result.objectCount,
          totalBytes: result.totalBytes,
          index: null,
          bytes: null,
        };
        this.flash(`${result.dataset} cloned to ${result.dest}`);
      }
    } catch (error) {
      this.detailError = error as HubErrorShape;
      this.renderShell();
    } finally {
      this.cloning = false;
      this.renderShell();
    }
  }

  private listParams(offset: number): DatasetListParams {
    return {
      primitives: [...this.primitives],
      tasks: [...this.tasks],
      tags: [...this.tags],
      query: this.query,
      sort: this.sort,
      includeFacets: true,
      limit: PAGE_SIZE,
      offset,
    };
  }

  private selectedBranch(): string {
    const select = this.root.querySelector<HTMLSelectElement>(".branch-select");
    return select?.value || this.detail?.refs?.default_branch || this.detail?.card.default_branch || "main";
  }

  private renderShell(): void {
    const focusedSearch = this.focusedSearch();
    clear(this.root);
    document.body.classList.add("hub-body");
    this.root.className = "hub-shell";
    this.root.append(this.header(), this.toolbar(), this.content());
    if (this.toast) this.root.append(h("div", { class: "hub-toast", role: "status" }, this.toast));
    this.restoreSearchFocus(focusedSearch);
  }

  private header(): HTMLElement {
    const hub = this.bootstrap?.hub;
    const info = this.bootstrap?.info;
    const warning = hub?.warning ? h("div", { class: "hub-warning" }, hub.warning) : null;
    return h(
      "header",
      { class: "hub-header" },
      h(
        "div",
        { class: "hub-title" },
        h("span", { class: "codicon codicon-cloud-download", "aria-hidden": "true" }),
        h("div", {}, h("h1", {}, "StrataHub"), h("p", {}, "Browse public Strata databases and clone them into this workspace.")),
      ),
      h(
        "div",
        { class: "hub-actions" },
        h(
          "div",
          { class: "hub-source", title: hub?.url ?? "Hub URL" },
          h("span", { class: "hub-source-label" }, "Hub"),
          h("strong", {}, hub ? compactHub(hub.url) : "Resolving..."),
          h("span", {}, hub?.source ?? "loading"),
        ),
        info
          ? h(
              "div",
              { class: "hub-info", title: `StrataHub ${info.server_version}` },
              `protocol ${info.protocol_version}`,
            )
          : null,
        h("button", { class: "icon-button", title: "Refresh", onclick: () => void this.refresh() }, icon("refresh")),
        h("button", { class: "ghost-button", onclick: () => void this.changeHub() }, "Change Hub"),
        hub?.overridden
          ? h("button", { class: "ghost-button", onclick: () => void this.useDefaultHub() }, "Use Default")
          : null,
        hub?.overridden && this.bootstrap?.canClone
          ? h("button", { class: "ghost-button", onclick: () => void this.setGlobalHub() }, "Set Global")
          : null,
      ),
      warning,
    );
  }

  private toolbar(): HTMLElement {
    const taskFacets = this.facetOptions("tasks");
    const tagFacets = this.facetOptions("tags");
    return h(
      "section",
      { class: "hub-toolbar", "aria-label": "Dataset filters" },
      h(
        "label",
        { class: "hub-search" },
        icon("search"),
        h("input", {
          class: "hub-search-input",
          type: "search",
          placeholder: "Find datasets by name, task, tag, primitive, or license",
          value: this.query,
          oninput: (event) => {
            this.updateQuery((event.target as HTMLInputElement).value);
          },
        }),
        this.query
          ? h(
              "button",
              {
                class: "icon-button search-clear",
                title: "Clear search",
                type: "button",
                onclick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  this.clearSearch();
                },
              },
              icon("close"),
            )
          : null,
      ),
      h(
        "div",
        { class: "filter-row" },
        h("span", { class: "filter-label" }, "Primitive"),
        ...PRIMITIVES.map((primitive) =>
          this.filterChip(
            primitive.label,
            primitive.value,
            "primitive",
            primitive.icon,
            this.primitiveFacetCount(primitive.value),
          ),
        ),
      ),
      h(
        "div",
        { class: "filter-row" },
        h("span", { class: "filter-label" }, "Task"),
        ...taskFacets.slice(0, 8).map((task) => this.filterChip(task.value, task.value, "task", "tag", task.count)),
        taskFacets.length === 0 ? h("span", { class: "muted" }, "Loading facets") : null,
      ),
      h(
        "div",
        { class: "filter-row" },
        h("span", { class: "filter-label" }, "Tag"),
        ...tagFacets.slice(0, 8).map((tag) => this.filterChip(tag.value, tag.value, "tag", "tag", tag.count)),
        tagFacets.length === 0 ? h("span", { class: "muted" }, "Loading facets") : null,
      ),
      h(
        "div",
        { class: "filter-row sort-row" },
        h("span", { class: "filter-label" }, "Sort"),
        ...SORTS.map((sort) =>
          h(
            "button",
            {
              class: `seg-button${this.sort === sort.value ? " active" : ""}`,
              onclick: () => {
                this.sort = sort.value;
                void this.loadList(true);
              },
            },
            icon(sort.icon),
            sort.label,
          ),
        ),
      ),
    );
  }

  private filterChip(
    label: string,
    value: string,
    kind: "primitive" | "task" | "tag",
    iconName: string,
    count?: number,
  ): HTMLElement {
    const set = kind === "primitive" ? this.primitives : kind === "task" ? this.tasks : this.tags;
    const active = set.has(value as never);
    return h(
      "button",
      {
        class: `filter-chip${active ? " active" : ""}`,
        onclick: () => {
          if (active) set.delete(value as never);
          else set.add(value as never);
          void this.loadList(true);
        },
      },
      icon(iconName),
      label,
      count !== undefined ? h("span", { class: "chip-count" }, formatCount(count)) : null,
    );
  }

  private content(): HTMLElement {
    return h(
      "main",
      { class: "hub-content" },
      h("section", { class: "dataset-list", "aria-label": "Datasets" }, this.listHeader(), this.listBody()),
      h("section", { class: "dataset-detail", "aria-label": "Dataset detail" }, this.detailBody()),
    );
  }

  private listHeader(): HTMLElement {
    const filtered = this.filteredDatasets();
    const title = this.query ? (this.serverSearchCurrent() ? "Search results" : "Filtered loaded datasets") : "Datasets";
    return h(
      "div",
      { class: "list-header" },
      h("div", {}, h("h2", {}, title), h("p", {}, this.countLabel(filtered.length))),
      this.loadingList ? h("span", { class: "loading-pill" }, "Loading") : null,
    );
  }

  private listBody(): HTMLElement {
    if (this.listError && this.datasets.length === 0) return this.errorState(this.listError, () => void this.loadList(true, true));
    if (this.loadingList && this.datasets.length === 0) {
      return h("div", { class: "skeleton-list" }, ...Array.from({ length: 8 }, () => h("div", { class: "skeleton-row" })));
    }
    const filtered = this.filteredDatasets();
    if (filtered.length === 0) {
      return h(
        "div",
        { class: "empty-hub" },
        icon("search-stop"),
        h("h3", {}, this.query ? "No loaded datasets match" : "No datasets found"),
        h("p", {}, this.query ? "Clear search or load more results from the hub." : "Try another filter or hub."),
      );
    }
    return h(
      "div",
      { class: "list-scroll" },
      ...filtered.map((item) => this.datasetRow(item)),
      this.offset < this.total
        ? h(
            "button",
            { class: "load-more", onclick: () => void this.loadList(false) },
            this.loadingList ? "Loading..." : `Load more (${formatCount(this.total - this.offset)} left)`,
          )
        : null,
      this.listError ? h("p", { class: "stale-note" }, this.listError.message) : null,
    );
  }

  private datasetRow(item: DatasetSummary): HTMLElement {
    const selected = item.name === this.selected;
    return h(
      "button",
      {
        class: `dataset-row${selected ? " selected" : ""}`,
        type: "button",
        onclick: () => void this.selectDataset(item.name),
      },
      h(
        "span",
        { class: "row-top" },
        h("strong", {}, item.name),
        item.badge ? h("span", { class: `badge badge-${item.badge}` }, item.badge) : null,
      ),
      h("span", { class: "row-description" }, item.description),
      h(
        "span",
        { class: "row-chips" },
        ...item.primitives.map((primitive) => primitiveChip(primitive)),
        ...item.tasks.slice(0, 2).map((task) => h("span", { class: "mini-chip" }, task)),
      ),
      h(
        "span",
        { class: "row-meta" },
        `${formatBytes(item.size_bytes)} - ${formatCount(item.downloads)} downloads - ${item.license}`,
      ),
    );
  }

  private detailBody(): HTMLElement {
    if (this.loadingDetail && !this.detail) {
      return h("div", { class: "detail-loading" }, h("div", { class: "skeleton-title" }), h("div", { class: "skeleton-block" }));
    }
    if (this.detailError && !this.detail) return this.errorState(this.detailError, () => this.selected && void this.selectDataset(this.selected, true));
    if (!this.detail) {
      return h(
        "div",
        { class: "detail-placeholder" },
        icon("database"),
        h("h2", {}, "Select a dataset"),
        h("p", {}, "Dataset cards show branches, schema, examples, provenance, and clone options."),
      );
    }

    const card = this.detail.card;
    return h(
      "div",
      { class: "detail-scroll" },
      this.detail.stale ? h("div", { class: "stale-banner" }, "Showing cached data while the hub refreshes.") : null,
      this.detailHeader(card, this.detail.refs),
      this.cloneStatus(card),
      this.detailTabs(),
      this.tab === "overview" ? this.overview(card, this.detail.refs) : null,
      this.tab === "preview" ? this.preview(card.sample_preview) : null,
      this.tab === "schema" ? this.schema(card) : null,
      this.tab === "readme" ? this.readme(card.readme) : null,
    );
  }

  private detailHeader(card: DatasetCard, refs: RefList | null): HTMLElement {
    const branches = refs?.refs.length ? refs.refs.map((ref) => ref.branch) : [card.default_branch];
    const cloneDisabled = this.cloning || !this.bootstrap?.canClone;
    return h(
      "div",
      { class: "detail-head" },
      h(
        "div",
        { class: "detail-title" },
        h("div", { class: "eyebrow" }, card.owner || "stratahub"),
        h("h2", {}, card.name),
        h("p", {}, card.description),
        h("div", { class: "row-chips" }, ...card.primitives.map((primitive) => primitiveChip(primitive)), ...card.tasks.map((task) => h("span", { class: "mini-chip" }, task))),
      ),
      h(
        "div",
        { class: "clone-box" },
        h(
          "label",
          { class: "branch-field" },
          h("span", {}, "Branch"),
          h(
            "select",
            { class: "branch-select" },
            ...branches.map((branch) =>
              h(
                "option",
                { value: branch, ...(branch === (refs?.default_branch ?? card.default_branch) ? { selected: "selected" } : {}) },
                branch,
              ),
            ),
          ),
        ),
        h(
          "button",
          {
            class: "primary-button",
            ...(cloneDisabled ? { disabled: "true", title: this.cloneDisabledReason() } : {}),
            onclick: () => void this.cloneSelected(),
          },
          icon("cloud-download"),
          "Clone",
        ),
        cloneDisabled ? h("p", { class: "muted" }, this.cloneDisabledReason()) : h("p", { class: "muted" }, `Creates ${card.name} as a local folder.`),
      ),
    );
  }

  private cloneStatus(card: DatasetCard): HTMLElement | null {
    if (this.cloning) return this.cloneProgressPanel(card);
    if (this.lastClone?.cloned && this.lastClone.dest && this.lastClone.dataset === card.name) {
      return this.cloneSuccessPanel(this.lastClone);
    }
    return null;
  }

  private cloneProgressPanel(card: DatasetCard): HTMLElement {
    const progress = this.cloneProgress;
    const percent = progress ? cloneProgressPercent(progress) : null;
    return h(
      "div",
      { class: "clone-status-card progress-card" },
      h(
        "div",
        { class: "clone-status-head" },
        icon("sync"),
        h(
          "div",
          {},
          h("strong", {}, progress ? cloneProgressTitle(progress) : `Cloning ${card.name}`),
          h("p", {}, progress ? cloneProgressDetail(progress) : "Starting the Strata clone command."),
        ),
        percent !== null ? h("span", { class: "progress-percent" }, `${Math.round(percent)}%`) : null,
      ),
      h(
        "div",
        { class: `progress-track${percent === null ? " indeterminate" : ""}` },
        h("span", { style: `width: ${percent ?? 38}%` }),
      ),
    );
  }

  private cloneSuccessPanel(clone: HubCloneData): HTMLElement {
    const metrics = [
      clone.objectCount !== null ? `${formatCount(clone.objectCount)} objects` : null,
      clone.totalBytes !== null ? formatBytes(clone.totalBytes) : null,
      clone.manifestHash ? shortHash(clone.manifestHash) : null,
    ].filter((value): value is string => value !== null);
    return h(
      "div",
      { class: "clone-status-card success-card" },
      h(
        "div",
        { class: "clone-status-head" },
        icon("check"),
        h(
          "div",
          {},
          h("strong", {}, "Clone complete"),
          h("p", { title: clone.dest ?? "" }, clone.dest ?? "Local database is ready."),
        ),
        h("span", { class: "success-pill" }, "connected"),
      ),
      metrics.length ? h("div", { class: "clone-metrics" }, ...metrics.map((metricText) => h("span", {}, metricText))) : null,
      h(
        "div",
        { class: "clone-actions" },
        h(
          "button",
          { class: "primary-button", onclick: () => void this.openClone(clone) },
          icon("open-preview"),
          "Open Object Browser",
        ),
        h("button", { class: "ghost-button", onclick: () => void this.revealClone(clone) }, icon("list-tree"), "Reveal"),
        h("button", { class: "ghost-button", onclick: () => void this.copyClonePath(clone) }, icon("copy"), "Copy Path"),
      ),
    );
  }

  private detailTabs(): HTMLElement {
    const tabs: Array<{ value: DetailTab; label: string; icon: string }> = [
      { value: "overview", label: "Overview", icon: "layout" },
      { value: "preview", label: "Preview", icon: "table" },
      { value: "schema", label: "Schema", icon: "symbol-structure" },
      { value: "readme", label: "README", icon: "book" },
    ];
    return h(
      "div",
      { class: "detail-tabs", role: "tablist" },
      ...tabs.map((tab) =>
        h(
          "button",
          {
            role: "tab",
            "aria-selected": String(this.tab === tab.value),
            class: `tab-button${this.tab === tab.value ? " active" : ""}`,
            onclick: () => {
              this.tab = tab.value;
              this.renderShell();
            },
          },
          icon(tab.icon),
          tab.label,
        ),
      ),
    );
  }

  private overview(card: DatasetCard, refs: RefList | null): HTMLElement {
    return h(
      "div",
      { class: "detail-section" },
      h(
        "div",
        { class: "metric-grid" },
        metric("Size", formatBytes(card.size_bytes)),
        metric("Downloads", formatCount(card.downloads)),
        metric("License", card.license),
        metric("Updated", formatDate(card.last_updated)),
        metric("Engine", card.engine_version_required),
        metric("Manifest", shortHash(card.manifest_hash)),
      ),
      card.summary_excerpt ? h("p", { class: "summary-excerpt" }, card.summary_excerpt) : null,
      refs
        ? h(
            "div",
            { class: "branch-list" },
            h("h3", {}, "Branches"),
            ...refs.refs.map((ref) =>
              h(
                "div",
                { class: "branch-row" },
                h("span", {}, ref.branch),
                h("code", {}, shortHash(ref.manifest_hash)),
                h("span", {}, formatDate(ref.last_updated)),
              ),
            ),
          )
        : null,
      Object.keys(card.quick_start_snippets ?? {}).length
        ? h(
            "div",
            { class: "snippet-grid" },
            h("h3", {}, "Quick Start"),
            ...Object.entries(card.quick_start_snippets).map(([language, code]) =>
              h("pre", {}, h("code", {}, `${language}\n${code}`)),
            ),
          )
        : null,
      card.provenance
        ? h(
            "div",
            { class: "provenance" },
            h("h3", {}, "Provenance"),
            h("p", {}, `${card.provenance.source} - curated by ${card.provenance.curator}`),
          )
        : null,
    );
  }

  private preview(preview: SamplePreview | undefined): HTMLElement {
    if (!preview || Object.keys(preview).length === 0) {
      return h("div", { class: "empty-panel" }, "No sample preview published for this dataset.");
    }
    return h(
      "div",
      { class: "detail-section preview-grid" },
      preview.kv?.length ? previewTable("KV", ["Key", "Value"], preview.kv.map((row) => [row.key, row.value_summary])) : null,
      preview.json?.length ? previewTable("JSON", ["Path", "Example"], preview.json.map((row) => [row.path, formatJson(row.example_value)])) : null,
      preview.vectors?.length
        ? previewTable(
            "Vectors",
            ["Collection", "Preview"],
            preview.vectors.map((row) => [row.collection, `${row.dimension}d - [${row.vector_preview.slice(0, 4).join(", ")}]`]),
          )
        : null,
      preview.events?.length
        ? previewTable(
            "Events",
            ["Stream", "Event"],
            preview.events.map((row) => [row.stream, `${formatDate(row.timestamp)} - ${row.event_summary}`]),
          )
        : null,
      preview.branches?.length
        ? previewTable(
            "Branches",
            ["Branch", "Created"],
            preview.branches.map((row) => [row.name, `${formatDate(row.created)}${row.is_default ? " - default" : ""}`]),
          )
        : null,
    );
  }

  private schema(card: DatasetCard): HTMLElement {
    const schema = card.schema;
    if (!schema || Object.keys(schema).length === 0) {
      return h("div", { class: "empty-panel" }, "No schema published for this dataset.");
    }
    return h(
      "div",
      { class: "detail-section schema-grid" },
      schema.kv?.namespaces.length
        ? previewTable(
            "KV Namespaces",
            ["Prefix", "Type", "Rows"],
            schema.kv.namespaces.map((row) => [row.prefix, row.value_type, formatCount(row.entry_count)]),
          )
        : null,
      schema.json?.fields
        ? previewTable("JSON Fields", ["Field", "Type"], Object.entries(schema.json.fields).map(([field, type]) => [field, type]))
        : null,
      schema.vectors?.collections.length
        ? previewTable(
            "Vector Collections",
            ["Name", "Shape", "Rows"],
            schema.vectors.collections.map((row) => [row.name, `${row.dimension}d ${row.metric}`, formatCount(row.count)]),
          )
        : null,
      schema.events?.streams.length
        ? previewTable(
            "Event Streams",
            ["Stream", "Shape"],
            schema.events.streams.map((row) => [row.name, formatJson(row.event_shape)]),
          )
        : null,
    );
  }

  private readme(markdown: string): HTMLElement {
    if (!markdown.trim()) return h("div", { class: "empty-panel" }, "No README published for this dataset.");
    const body = h("div", { class: "readme-body" });
    for (const block of markdown.split(/\n{2,}/)) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("```")) {
        body.append(h("pre", {}, h("code", {}, trimmed.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trim())));
      } else if (trimmed.startsWith("# ")) {
        body.append(h("h2", {}, trimmed.replace(/^#\s+/, "")));
      } else if (trimmed.startsWith("## ")) {
        body.append(h("h3", {}, trimmed.replace(/^##\s+/, "")));
      } else if (trimmed.startsWith("- ")) {
        body.append(h("ul", {}, ...trimmed.split("\n").map((line) => h("li", {}, line.replace(/^-\s+/, "")))));
      } else {
        body.append(h("p", {}, trimmed.replace(/\n/g, " ")));
      }
    }
    return h("div", { class: "detail-section" }, body);
  }

  private filteredDatasets(): DatasetSummary[] {
    const q = normalizeQuery(this.query);
    if (!q) return this.datasets;
    if (this.serverSearchCurrent()) return this.datasets;
    return this.datasets.filter((item) => normalizeQuery(searchText(item)).includes(q));
  }

  private countLabel(filteredCount: number): string {
    if (this.query && this.serverSearchCurrent()) {
      return `${formatCount(this.datasets.length)} of ${formatCount(this.total)} results shown`;
    }
    if (this.query) return `${formatCount(filteredCount)} matching loaded rows - ${formatCount(this.datasets.length)} loaded`;
    if (this.total === 0 && !this.loadingList) return "No datasets";
    const shown = Math.min(this.datasets.length, this.total || this.datasets.length);
    return `${formatCount(shown)} of ${formatCount(this.total)} shown`;
  }

  private serverSearchCurrent(): boolean {
    const query = this.query.trim();
    return query.length > 0 && this.serverSearchSettledQuery === query;
  }

  private cloneDisabledReason(): string {
    if (this.cloning) return "Clone is already running.";
    if (!this.bootstrap?.trusted) return "Clone is disabled in untrusted workspaces.";
    if (!this.bootstrap?.binaryAvailable) return "Set the Strata binary path to enable clone.";
    return "Clone is unavailable.";
  }

  private clearSearch(): void {
    this.updateQuery("");
  }

  private updateQuery(value: string): void {
    this.query = value;
    this.selected = null;
    this.detail = null;
    this.detailError = null;
    this.renderShell();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.loadList(true);
    }, SEARCH_DEBOUNCE_MS);
  }

  private facetOptions(group: "tasks" | "tags"): Array<{ value: string; count?: number }> {
    const active = group === "tasks" ? this.tasks : this.tags;
    const fromServer = this.serverFacets?.[group]
      .filter((item) => item.count > 0 || active.has(item.value))
      .map((item) => ({ value: item.value, count: item.count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const options: Array<{ value: string; count?: number }> =
      fromServer ?? facets(this.datasets)[group].map((value) => ({ value }));
    for (const value of active) {
      if (!options.some((item) => item.value === value)) options.unshift({ value, count: 0 });
    }
    return options;
  }

  private primitiveFacetCount(primitive: HubPrimitive): number | undefined {
    return this.serverFacets?.primitives.find((item) => item.value === primitive)?.count;
  }

  private receiveCloneProgress(event: HubCloneProgressData): void {
    if (this.detail?.card.name !== event.dataset) return;
    this.cloneProgress = event;
    const now = Date.now();
    if (event.stage === "done" || event.stage === "importing" || now - this.lastProgressRender > 120) {
      this.lastProgressRender = now;
      this.renderShell();
    }
  }

  private async openClone(clone: HubCloneData): Promise<void> {
    if (!clone.dest) return;
    await this.runCloneAction({ op: "open-clone", dest: clone.dest, branch: clone.branch }, "Opened object browser");
  }

  private async revealClone(clone: HubCloneData): Promise<void> {
    if (!clone.dest) return;
    await this.runCloneAction({ op: "reveal-clone", dest: clone.dest }, "Revealed in explorer");
  }

  private async copyClonePath(clone: HubCloneData): Promise<void> {
    if (!clone.dest) return;
    await this.runCloneAction({ op: "copy-path", dest: clone.dest }, "Path copied");
  }

  private async runCloneAction(payload: HubViewOp, message: string): Promise<void> {
    try {
      await this.rpc.request(payload);
      this.flash(message);
    } catch (error) {
      this.detailError = error as HubErrorShape;
      this.renderShell();
    }
  }

  private focusedSearch(): { start: number | null; end: number | null } | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement) || !active.classList.contains("hub-search-input")) return null;
    return { start: active.selectionStart, end: active.selectionEnd };
  }

  private restoreSearchFocus(saved: { start: number | null; end: number | null } | null): void {
    if (!saved) return;
    const input = this.root.querySelector<HTMLInputElement>(".hub-search-input");
    if (!input) return;
    input.focus();
    input.setSelectionRange(saved.start, saved.end);
  }

  private errorState(error: HubErrorShape, retry: () => void): HTMLElement {
    return h(
      "div",
      { class: "hub-error" },
      icon("error"),
      h("h3", {}, error.status ? `Hub returned ${error.status}` : "Hub request failed"),
      h("p", {}, error.message),
      error.code ? h("code", {}, error.code) : null,
      h("button", { class: "ghost-button", onclick: retry }, error.retryable ? "Retry" : "Try Again"),
    );
  }

  private flash(message: string): void {
    this.toast = message;
    this.renderShell();
    setTimeout(() => {
      if (this.toast === message) {
        this.toast = null;
        this.renderShell();
      }
    }, 4_000);
  }
}

function emptyBootstrap(data: HubListData): HubBootstrapData {
  return {
    hub: data.hub,
    info: null,
    binaryAvailable: false,
    trusted: false,
    canClone: false,
  };
}

function icon(name: string): HTMLElement {
  return h("span", { class: `codicon codicon-${name}`, "aria-hidden": "true" });
}

function primitiveChip(primitive: HubPrimitive): HTMLElement {
  const iconName = PRIMITIVES.find((item) => item.value === primitive)?.icon ?? "circle-filled";
  return h("span", { class: `primitive-chip primitive-${primitive}` }, icon(iconName), primitive);
}

function cloneProgressPercent(event: HubCloneProgressData): number | null {
  switch (event.stage) {
    case "resolved":
      return 10;
    case "manifest_fetched":
      return 20;
    case "object_fetched":
      if (!event.index || !event.objectCount) return 35;
      return Math.min(80, 20 + (event.index / Math.max(1, event.objectCount)) * 60);
    case "importing":
      return 88;
    case "done":
      return 100;
    case "unknown":
      return null;
  }
}

function cloneProgressTitle(event: HubCloneProgressData): string {
  switch (event.stage) {
    case "resolved":
      return "Ref resolved";
    case "manifest_fetched":
      return "Manifest fetched";
    case "object_fetched":
      return "Downloading objects";
    case "importing":
      return "Importing database";
    case "done":
      return "Clone complete";
    case "unknown":
      return "Cloning";
  }
}

function cloneProgressDetail(event: HubCloneProgressData): string {
  switch (event.stage) {
    case "resolved":
      return `${event.branch ?? "Selected branch"}${event.manifestHash ? ` at ${shortHash(event.manifestHash)}` : ""}`;
    case "manifest_fetched":
      return [
        event.objectCount !== null ? `${formatCount(event.objectCount)} objects` : null,
        event.totalBytes !== null ? formatBytes(event.totalBytes) : null,
      ].filter(Boolean).join(" - ") || "The hub manifest is ready.";
    case "object_fetched":
      return event.index && event.objectCount
        ? `Fetched object ${formatCount(event.index)} of ${formatCount(event.objectCount)}${event.bytes !== null ? ` - ${formatBytes(event.bytes)}` : ""}`
        : "Fetched one object.";
    case "importing":
      return "Reconstituting the local Strata database.";
    case "done":
      return "The cloned database is ready.";
    case "unknown":
      return "The installed Strata binary reported progress.";
  }
}

function metric(label: string, value: string): HTMLElement {
  return h("div", { class: "metric" }, h("span", {}, label), h("strong", { title: value }, value));
}

function previewTable(title: string, headers: string[], rows: string[][]): HTMLElement {
  return h(
    "div",
    { class: "preview-table" },
    h("h3", {}, title),
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ...headers.map((header) => h("th", {}, header)))),
      h(
        "tbody",
        {},
        ...rows.slice(0, 8).map((row) => h("tr", {}, ...row.map((cell) => h("td", { title: cell }, cell)))),
      ),
    ),
  );
}

function facets(items: DatasetSummary[]): { tasks: string[]; tags: string[] } {
  const tasks = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const item of items) {
    for (const task of item.tasks) tasks.set(task, (tasks.get(task) ?? 0) + 1);
    for (const tag of item.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  const sort = (entries: Map<string, number>) =>
    [...entries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
  return { tasks: sort(tasks), tags: sort(tags) };
}

function compactHub(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.host : `${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shortHash(value: string): string {
  if (value.length <= 18) return value;
  const withoutPrefix = value.replace(/^blake3:/, "");
  return `blake3:${withoutPrefix.slice(0, 10)}`;
}

function formatJson(value: unknown): string {
  try {
    const rendered = JSON.stringify(value);
    return rendered && rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered ?? "null";
  } catch {
    return String(value);
  }
}

function normalizeQuery(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s:_-]+/g, "");
}

function searchText(item: DatasetSummary): string {
  return [
    item.name,
    item.description,
    item.license,
    item.default_branch,
    ...item.primitives,
    ...item.tasks,
    ...item.tags,
  ].join(" ");
}

const HUB_STYLES = `
html, body {
  height: 100%;
  padding: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.hub-body {
  margin: 0;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: "Inter", "Aptos", "SF Pro Text", "Segoe UI Variable", var(--vscode-font-family), sans-serif;
  font-size: var(--vscode-font-size);
}

.hub-shell {
  --hub-line: var(--vscode-widget-border);
  --hub-muted: var(--vscode-descriptionForeground);
  --hub-panel: color-mix(in srgb, var(--vscode-editorWidget-background) 70%, var(--vscode-editor-background));
  --hub-panel-2: color-mix(in srgb, var(--vscode-sideBar-background) 78%, var(--vscode-editor-background));
  --hub-hover: var(--vscode-list-hoverBackground);
  --hub-active: var(--vscode-list-activeSelectionBackground);
  --hub-active-fg: var(--vscode-list-activeSelectionForeground);
  --hub-accent: var(--vscode-charts-blue);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 100vh;
}

.hub-header {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--hub-line);
  background: color-mix(in srgb, var(--vscode-sideBar-background) 52%, var(--vscode-editor-background));
}

.hub-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hub-title > .codicon {
  color: var(--hub-accent);
  font-size: 22px;
}

.hub-title h1,
.hub-title p,
.list-header h2,
.list-header p,
.detail-title h2,
.detail-title p,
.hub-error h3,
.hub-error p {
  margin: 0;
}

.hub-title h1 {
  font-size: 19px;
  font-weight: 650;
  letter-spacing: 0;
}

.hub-title p,
.muted,
.row-meta,
.row-description,
.hub-source span,
.hub-info,
.stale-note {
  color: var(--hub-muted);
}

.hub-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-items: center;
}

.hub-source {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 8px;
  align-items: baseline;
  padding: 6px 9px;
  border: 1px solid var(--hub-line);
  background: var(--hub-panel);
  border-radius: 6px;
  max-width: 360px;
}

.hub-source-label {
  grid-row: span 2;
  align-self: center;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--hub-muted);
}

.hub-source strong {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}

.hub-source span:last-child,
.hub-info,
.eyebrow,
.filter-label {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
}

.hub-info {
  border: 1px solid var(--hub-line);
  border-radius: 999px;
  padding: 5px 8px;
}

.hub-warning {
  grid-column: 1 / -1;
  color: var(--vscode-inputValidation-warningForeground);
  background: var(--vscode-inputValidation-warningBackground);
  border: 1px solid var(--vscode-inputValidation-warningBorder);
  padding: 7px 9px;
  border-radius: 4px;
}

.hub-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--hub-line);
}

.hub-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(520px, 100%);
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--vscode-input-border, var(--hub-line));
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px;
}

.hub-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
}

.filter-label {
  color: var(--hub-muted);
  margin-right: 2px;
}

button {
  font: inherit;
  color: inherit;
  appearance: none;
}

.icon-button,
.ghost-button,
.filter-chip,
.seg-button,
.primary-button,
.load-more,
.tab-button {
  border: 1px solid var(--vscode-button-border, var(--hub-line));
  border-radius: 4px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}

.icon-button {
  width: 28px;
  padding: 0;
  background: transparent;
}

.ghost-button,
.filter-chip,
.seg-button,
.tab-button,
.load-more {
  padding: 0 10px;
  background: transparent;
}

.primary-button {
  padding: 0 14px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
  font-weight: 650;
}

.primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-button:hover,
.ghost-button:hover,
.filter-chip:hover,
.seg-button:hover,
.tab-button:hover,
.load-more:hover {
  background: var(--hub-hover);
}

.filter-chip.active,
.seg-button.active,
.tab-button.active {
  color: var(--hub-active-fg);
  background: var(--hub-active);
  border-color: color-mix(in srgb, var(--hub-active) 65%, var(--hub-line));
}

.chip-count {
  color: inherit;
  opacity: 0.72;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.hub-content {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 42%) minmax(420px, 1fr);
}

.dataset-list,
.dataset-detail {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.dataset-list {
  border-right: 1px solid var(--hub-line);
  background: var(--hub-panel-2);
}

.list-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 16px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--hub-line) 65%, transparent);
}

.list-header h2 {
  font-size: 13px;
  font-weight: 700;
}

.list-scroll,
.detail-scroll {
  min-height: 0;
  overflow: auto;
}

.dataset-row {
  width: 100%;
  height: auto;
  min-height: 116px;
  display: grid;
  grid-template-rows: auto auto auto auto;
  gap: 6px;
  align-items: start;
  text-align: left;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hub-line) 58%, transparent);
  background: transparent;
  color: inherit;
  line-height: 1.35;
}

.dataset-row > * {
  min-width: 0;
}

.dataset-row:hover {
  background: var(--hub-hover);
}

.dataset-row.selected {
  background: color-mix(in srgb, var(--hub-active) 70%, transparent);
  color: var(--hub-active-fg);
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.row-top strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.row-description {
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-height: 2.7em;
}

.row-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.primitive-chip,
.mini-chip,
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--hub-line);
  background: color-mix(in srgb, var(--vscode-badge-background) 12%, transparent);
  font-size: 11px;
  line-height: 20px;
  white-space: nowrap;
}

.primitive-kv .codicon { color: var(--vscode-charts-yellow); }
.primitive-json .codicon { color: var(--vscode-charts-blue); }
.primitive-vectors .codicon { color: var(--vscode-charts-purple); }
.primitive-events .codicon { color: var(--vscode-charts-green); }
.primitive-branches .codicon { color: var(--vscode-charts-orange); }

.badge {
  text-transform: uppercase;
  font-weight: 700;
  background: color-mix(in srgb, var(--vscode-charts-green) 16%, transparent);
}

.row-meta,
code,
pre,
table {
  font-family: var(--vscode-editor-font-family), monospace;
  font-variant-numeric: tabular-nums;
}

.detail-scroll {
  padding: 18px 20px 32px;
}

.detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, 260px);
  gap: 18px;
  align-items: start;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--hub-line);
}

.eyebrow {
  margin-bottom: 5px;
  color: var(--hub-muted);
}

.detail-title h2 {
  font-size: 22px;
  font-weight: 680;
  letter-spacing: 0;
}

.detail-title p {
  margin-top: 7px;
  line-height: 1.45;
  max-width: 760px;
}

.clone-box {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--hub-line);
  border-radius: 6px;
  background: var(--hub-panel);
}

.clone-status-card {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
  padding: 12px;
  border: 1px solid var(--hub-line);
  border-radius: 6px;
  background: var(--hub-panel);
}

.clone-status-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.clone-status-head > .codicon {
  color: var(--hub-accent);
  font-size: 17px;
}

.success-card .clone-status-head > .codicon {
  color: var(--vscode-charts-green);
}

.clone-status-head strong,
.clone-status-head p {
  display: block;
  margin: 0;
  min-width: 0;
}

.clone-status-head p {
  margin-top: 3px;
  color: var(--hub-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-track {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--hub-line) 55%, transparent);
}

.progress-track span {
  display: block;
  height: 100%;
  min-width: 6px;
  border-radius: inherit;
  background: var(--hub-accent);
  transition: width 140ms ease-out;
}

.progress-track.indeterminate span {
  width: 38%;
  animation: hub-progress-slide 1.1s ease-in-out infinite;
}

.progress-percent,
.success-pill {
  color: var(--hub-muted);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
}

.success-pill {
  color: var(--vscode-charts-green);
}

.clone-metrics,
.clone-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.clone-metrics span {
  min-height: 22px;
  padding: 3px 7px;
  border: 1px solid var(--hub-line);
  border-radius: 4px;
  color: var(--hub-muted);
  font-family: var(--vscode-editor-font-family), monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@keyframes hub-progress-slide {
  0% { transform: translateX(-120%); }
  55% { transform: translateX(80%); }
  100% { transform: translateX(260%); }
}

@media (prefers-reduced-motion: reduce) {
  .progress-track span {
    transition: none;
  }

  .progress-track.indeterminate span {
    animation: none;
  }
}

.branch-field {
  display: grid;
  gap: 5px;
}

.branch-field span {
  color: var(--hub-muted);
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
}

.branch-select {
  min-height: 28px;
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border, var(--hub-line));
  border-radius: 4px;
  padding: 0 8px;
}

.detail-tabs {
  display: flex;
  gap: 6px;
  margin: 14px 0;
}

.detail-section {
  display: grid;
  gap: 16px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(96px, 1fr));
  gap: 8px;
}

.metric {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--hub-line);
  border-radius: 6px;
  background: var(--hub-panel);
}

.metric span,
.metric strong {
  display: block;
}

.metric span {
  color: var(--hub-muted);
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
}

.metric strong {
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-excerpt {
  margin: 0;
  padding: 12px 0;
  color: var(--vscode-editor-foreground);
  line-height: 1.5;
}

.branch-list,
.snippet-grid,
.provenance,
.preview-table,
.readme-body {
  display: grid;
  gap: 8px;
}

.branch-list h3,
.snippet-grid h3,
.provenance h3,
.preview-table h3,
.readme-body h2,
.readme-body h3 {
  margin: 0;
  font-size: 13px;
}

.branch-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hub-line) 45%, transparent);
}

pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 12px;
  border: 1px solid var(--hub-line);
  border-radius: 6px;
  background: var(--vscode-textCodeBlock-background, var(--hub-panel));
}

.preview-grid,
.schema-grid {
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  align-items: start;
}

.preview-table {
  min-width: 0;
  border: 1px solid var(--hub-line);
  border-radius: 6px;
  padding: 10px;
  background: var(--hub-panel);
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th,
td {
  text-align: left;
  padding: 6px 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--hub-line) 45%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

th {
  color: var(--hub-muted);
  font-size: 11px;
  text-transform: uppercase;
}

.readme-body {
  max-width: 820px;
  line-height: 1.5;
}

.readme-body p,
.readme-body ul {
  margin: 0;
}

.hub-error,
.empty-hub,
.detail-placeholder,
.empty-panel,
.detail-loading,
.skeleton-list {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 22px;
  text-align: center;
  color: var(--hub-muted);
}

.hub-error .codicon,
.empty-hub .codicon,
.detail-placeholder .codicon {
  font-size: 28px;
}

.hub-error .codicon {
  color: var(--vscode-errorForeground);
}

.skeleton-list {
  place-items: stretch;
  align-content: start;
}

.skeleton-row,
.skeleton-title,
.skeleton-block {
  border-radius: 6px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--vscode-editor-foreground) 8%, transparent), transparent);
  border: 1px solid color-mix(in srgb, var(--hub-line) 45%, transparent);
}

.skeleton-row {
  height: 92px;
}

.skeleton-title {
  width: 55%;
  height: 28px;
}

.skeleton-block {
  width: 100%;
  height: 180px;
}

.loading-pill,
.stale-banner {
  color: var(--vscode-progressBar-background);
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
}

.stale-banner {
  margin-bottom: 12px;
  color: var(--vscode-inputValidation-warningForeground);
}

.load-more {
  width: calc(100% - 32px);
  margin: 12px 16px 18px;
}

.hub-toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  max-width: min(520px, calc(100vw - 36px));
  padding: 10px 12px;
  border: 1px solid var(--hub-line);
  border-radius: 6px;
  background: var(--vscode-notifications-background);
  color: var(--vscode-notifications-foreground);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 26%, transparent);
}

@media (max-width: 980px) {
  .hub-header {
    grid-template-columns: 1fr;
  }
  .hub-actions {
    justify-content: flex-start;
  }
  .hub-content {
    grid-template-columns: 1fr;
  }
  .dataset-list {
    min-height: 360px;
    border-right: 0;
    border-bottom: 1px solid var(--hub-line);
  }
  .detail-head {
    grid-template-columns: 1fr;
  }
  .metric-grid,
  .preview-grid,
  .schema-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .hub-header,
  .hub-toolbar,
  .detail-scroll {
    padding-left: 12px;
    padding-right: 12px;
  }
  .metric-grid,
  .preview-grid,
  .schema-grid,
  .branch-row {
    grid-template-columns: 1fr;
  }
  .hub-source {
    max-width: 100%;
  }
  .hub-source strong {
    max-width: 190px;
  }
}
`;

const style = document.createElement("style");
style.textContent = `${CODICON_CLASSES}\n${HUB_STYLES}`;
document.head.append(style);

const root = document.createElement("div");
document.body.append(root);
void new HubBrowserApp(root, new HubRpc()).start();
