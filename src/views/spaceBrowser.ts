/**
 * Unified space browser: one Redis-style list for the data in a branch/space,
 * with type filters when the user wants to narrow to one Strata primitive.
 */
import { byteEl, clear, commitTimeEl, flashCopied, h, preservingScroll, timeEl } from "./shared/dom";
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
  WriteResultData,
} from "./shared/messages";

const FILTERS: Array<{ value: SpaceFilter; label: string; icon: string }> = [
  { value: "all", label: "All", icon: "list-flat" },
  { value: "kv", label: "Keys", icon: "symbol-key" },
  { value: "json", label: "Documents", icon: "json" },
  { value: "events", label: "Events", icon: "pulse" },
  { value: "vectors", label: "Vectors", icon: "symbol-array" },
  { value: "graphs", label: "Graphs", icon: "type-hierarchy" },
];

type SortMode = "default" | "name" | "type" | "version" | "time";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "default", label: "Default order" },
  { value: "name", label: "Name" },
  { value: "type", label: "Type" },
  { value: "version", label: "Version" },
  { value: "time", label: "Time" },
];

const KIND_ORDER: Record<SpaceItem["kind"], number> = {
  kv: 0,
  json: 1,
  event: 2,
  "vector-collection": 3,
  graph: 4,
};

type Detail =
  | { kind: "kv"; value: KvValueData; timeline: TimelineData }
  | { kind: "json"; doc: JsonDocData; timeline: TimelineData }
  | { kind: "event" }
  | { kind: "vector"; page: VectorPageData }
  | { kind: "graph"; ontology: GraphOntologyData | null; seed: GraphExpandData };

type EditorKind = "kv" | "json";
type EditorState = {
  mode: "new" | "edit";
  kind: EditorKind;
  key: string;
  value: string;
  keyB64: string | null;
  error: string | null;
  saving: boolean;
};

export class SpaceBrowserView {
  private rows: SpaceItem[] = [];
  private cursor: string | null = null;
  private hasMore = false;
  private total: number | null = null;
  private notes: string[] = [];
  private filter: SpaceFilter = "all";
  private keyFilter = "";
  private sortMode: SortMode = "default";
  private sortDir: SortDir = "asc";
  private selected: SpaceItem | null = null;
  private detail: Detail | null = null;
  private pendingFocus: SpaceItem | null = null;
  private editor: EditorState | null = null;
  private toast: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
    initialFocus: ViewFocus | null = null,
  ) {
    this.pendingFocus = initialFocus?.type === "space-item" ? initialFocus.item : null;
    rpc.onScopeChange(() => {
      if (this.editor) return;
      void this.reload();
    });
  }

  async reload(): Promise<void> {
    const focus = this.pendingFocus;
    this.pendingFocus = null;
    this.rows = [];
    this.cursor = null;
    if (!this.editor) {
      this.selected = null;
      this.detail = null;
    }
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
    const shellAttrs = {
      class: "object-browser-shell",
      onkeydown: (e: Event) => this.onKeyDown(e),
    };
    if (this.rows.length === 0 && !this.hasMore && !this.keyFilter.trim() && !this.editor) {
      this.root.append(
        h(
          "section",
          shellAttrs,
          scopeBanner(scope, null, this.backToNow()),
          this.toolbar(),
          emptyState(
            "symbol-namespace",
            "No objects in this space",
            "New data written by the owning app appears here live.",
          ),
        ),
      );
      return;
    }

    const visibleRows = this.visibleRows();
    const facts = this.keyFilter.trim()
      ? `${formatCount(visibleRows.length)} shown matching "${this.keyFilter.trim()}" of ${formatCount(this.rows.length)} loaded${this.hasMore ? " - next page available" : ""}`
      : `${formatCount(this.rows.length)} shown${this.total !== null ? ` of ${formatCount(this.total)}` : ""}${this.hasMore ? " - next page available" : ""}`;
    this.root.append(
      h(
        "section",
        shellAttrs,
        scopeBanner(scope, facts, this.backToNow()),
        this.toolbar(),
        this.toast ? h("div", { class: "write-toast", role: "status" }, h("span", { class: "codicon codicon-check", "aria-hidden": "true" }), this.toast) : null,
        h("span", { class: "sr-only", "aria-live": "polite" }, facts),
        ...this.notes.map((note) => h("div", { class: "space-note" }, note)),
        h(
          "div",
          { class: "space-browser" },
          h(
            "div",
            { class: "space-list" },
            this.tableEl(visibleRows),
            visibleRows.length === 0 && this.keyFilter.trim()
              ? this.filterEmptyEl()
              : null,
            this.hasMore
              ? h(
                  "button",
                  { class: "load-more", onclick: () => void this.loadPage(this.cursor) },
                  h("span", { class: "codicon codicon-chevron-down", "aria-hidden": "true" }),
                  `Load more results (${formatCount(this.rows.length)} loaded)`,
                )
              : null,
          ),
          h("div", { class: "detail" }, ...this.detailInner()),
        ),
      ),
    );
  }

  private toolbar(): HTMLElement {
    const counts = this.typeCounts();
    const writeAttrs: Record<string, string | ((event: Event) => void)> = {
      class: "new-object-button",
      title: this.rpc.scope?.asOfLabel
        ? "Back to now to create objects."
        : "Create a key or document in this branch and space.",
    };
    if (this.rpc.scope?.asOfLabel) {
      writeAttrs.disabled = "true";
    } else {
      writeAttrs.onclick = () => this.startNewObject();
    }
    const sortSelect = h(
      "select",
      {
        class: "sort-select",
        "aria-label": "Sort objects",
        title: "Sort objects",
        onchange: (e) => {
          this.sortMode = (e.target as HTMLSelectElement).value as SortMode;
          this.render();
        },
      },
      ...SORT_OPTIONS.map((option) => h("option", { value: option.value }, option.label)),
    );
    sortSelect.value = this.sortMode;

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
              title: `${option.label} - ${formatCount(counts[option.value])} loaded`,
              onclick: () => {
                this.changeFilter(option.value);
              },
            },
            h("span", { class: `codicon codicon-${option.icon}`, "aria-hidden": "true" }),
            option.label,
            h("span", { class: "seg-count", "aria-hidden": "true" }, formatCount(counts[option.value])),
          ),
        ),
      ),
      h(
        "div",
        { class: "key-find", role: "search" },
        h("span", { class: "codicon codicon-search", "aria-hidden": "true" }),
        h("input", {
          class: "key-filter",
          type: "search",
          "aria-label": "Search object names",
          placeholder: this.filter === "kv" ? "Search keys..." : "Search objects...",
          title: "Filters loaded object names. Values are not searched.",
          value: this.keyFilter,
          oninput: (e) => {
            this.keyFilter = (e.target as HTMLInputElement).value;
            this.clearHiddenSelection();
            this.render();
          },
        }),
        this.keyFilter
          ? h(
              "button",
              {
                class: "icon-button search-clear",
                title: "Clear search",
                onclick: () => this.clearSearch(),
              },
              h("span", { class: "codicon codicon-close", "aria-hidden": "true" }),
            )
          : null,
      ),
      h(
        "div",
        { class: "sort-control" },
        h("span", { class: "codicon codicon-sort-precedence", "aria-hidden": "true" }),
        sortSelect,
        this.sortDirectionButton(),
      ),
      h(
        "div",
        { class: "write-slot" },
        h(
          "button",
          writeAttrs,
          h("span", { class: "codicon codicon-add", "aria-hidden": "true" }),
          "New",
        ),
      ),
    );
  }

  private sortDirectionButton(): HTMLElement {
    const attrs: Record<string, string | ((event: Event) => void)> = {
      class: "icon-button sort-direction",
      title: this.sortMode === "default"
        ? "Default order follows the database"
        : this.sortDir === "asc"
          ? "Sort descending"
          : "Sort ascending",
    };
    if (this.sortMode === "default") {
      attrs.disabled = "true";
    } else {
      attrs.onclick = () => {
        this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
        this.render();
      };
    }
    return h(
      "button",
      attrs,
      h("span", { class: `codicon codicon-arrow-${this.sortDir === "asc" ? "up" : "down"}`, "aria-hidden": "true" }),
    );
  }

  private sortHeader(mode: Exclude<SortMode, "default">, label: string, className: string): HTMLElement {
    const active = this.sortMode === mode;
    return h(
      "th",
      {
        class: `${className} sortable${active ? " active" : ""}`,
        scope: "col",
        "aria-sort": active ? (this.sortDir === "asc" ? "ascending" : "descending") : "none",
        title: active
          ? `Sorted by ${label} ${this.sortDir === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`,
        onclick: () => {
          if (this.sortMode === mode) {
            this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
          } else {
            this.sortMode = mode;
            this.sortDir = "asc";
          }
          this.render();
        },
      },
      label,
      h("span", { class: `codicon codicon-arrow-${this.sortDir === "asc" ? "up" : "down"} sort-glyph${active ? " on" : ""}`, "aria-hidden": "true" }),
    );
  }

  private startNewObject(): void {
    this.selected = null;
    this.detail = null;
    this.editor = {
      mode: "new",
      kind: "kv",
      key: "",
      value: "",
      keyB64: null,
      error: null,
      saving: false,
    };
    this.render();
  }

  private detailActionButtons(row: SpaceItem): HTMLElement {
    const editAttrs: Record<string, string | ((event: Event) => void)> = {
      class: "icon-button",
      title: this.editTitle(row),
    };
    if (this.canEdit(row)) {
      editAttrs.onclick = () => this.startEdit(row);
    } else {
      editAttrs.disabled = "true";
    }
    return h(
      "span",
      { class: "detail-actions" },
      h("button", editAttrs, h("span", { class: "codicon codicon-edit", "aria-hidden": "true" })),
      h(
        "button",
        {
          class: "icon-button",
          disabled: "true",
          title: this.rpc.scope?.asOfLabel ? "Back to now to delete this object." : "Delete arrives later.",
        },
        h("span", { class: "codicon codicon-trash", "aria-hidden": "true" }),
      ),
    );
  }

  private canEdit(row: SpaceItem): boolean {
    if (this.rpc.scope?.asOfLabel || !this.detail) return false;
    if (row.kind === "kv" && this.detail.kind === "kv") {
      return this.detail.value.found && (this.detail.value.text !== null || this.detail.value.json !== null);
    }
    if (row.kind === "json" && this.detail.kind === "json") return this.detail.doc.found;
    return false;
  }

  private editTitle(row: SpaceItem): string {
    if (this.rpc.scope?.asOfLabel) return "Back to now to edit this object.";
    if (row.kind !== "kv" && row.kind !== "json") return "Inline editing is available for keys and documents.";
    if (row.kind === "kv" && this.detail?.kind === "kv" && this.detail.value.found && this.detail.value.text === null && this.detail.value.json === null) {
      return "Binary values are not editable inline yet.";
    }
    return "Edit value";
  }

  private startEdit(row: SpaceItem): void {
    if (!this.canEdit(row) || !this.detail) return;
    if (row.kind === "kv" && row.keyB64 && this.detail.kind === "kv") {
      const value = this.detail.value;
      this.editor = {
        mode: "edit",
        kind: "kv",
        key: row.label,
        value: value.json !== null ? JSON.stringify(value.json, null, 2) : value.text ?? "",
        keyB64: row.keyB64,
        error: null,
        saving: false,
      };
    } else if (row.kind === "json" && row.docId && this.detail.kind === "json") {
      this.editor = {
        mode: "edit",
        kind: "json",
        key: row.docId,
        value: JSON.stringify(this.detail.doc.value, null, 2),
        keyB64: null,
        error: null,
        saving: false,
      };
    }
    this.render();
  }

  private editorEl(): HTMLElement {
    const editor = this.editor!;
    const keyAttrs: Record<string, string | ((event: Event) => void)> = {
      class: "write-key",
      value: editor.key,
      spellcheck: "false",
      placeholder: editor.kind === "kv" ? "key" : "document id",
    };
    if (editor.mode === "edit") {
      keyAttrs.disabled = "true";
    } else {
      keyAttrs.oninput = (e) => {
        if (this.editor) this.editor.key = (e.target as HTMLInputElement).value;
      };
    }
    const valueAttrs: Record<string, string | ((event: Event) => void)> = {
      class: "write-value",
      spellcheck: "false",
      oninput: (e) => {
        if (this.editor) this.editor.value = (e.target as HTMLTextAreaElement).value;
      },
    };
    if (editor.saving) {
      keyAttrs.disabled = "true";
      valueAttrs.disabled = "true";
    }
    const saveAttrs: Record<string, string | ((event: Event) => void)> = {
      class: "primary-button",
      onclick: () => void this.saveEditor(),
    };
    if (editor.saving) saveAttrs.disabled = "true";
    const cancelAttrs: Record<string, string | ((event: Event) => void)> = {
      onclick: () => {
        this.editor = null;
        this.render();
      },
    };
    if (editor.saving) cancelAttrs.disabled = "true";

    return h(
      "div",
      { class: "write-editor" },
      h(
        "div",
        { class: "write-editor-head" },
        h(
          "span",
          { class: `type-pill type-${editor.kind === "kv" ? "kv" : "json"}` },
          h("span", { class: `codicon codicon-${editor.kind === "kv" ? "symbol-key" : "json"}`, "aria-hidden": "true" }),
          editor.kind === "kv" ? "Key" : "Doc",
        ),
        h("span", { class: "write-title" }, `${editor.mode === "new" ? "New" : "Edit"} ${editor.kind === "kv" ? "key" : "document"}`),
      ),
      editor.mode === "new" ? this.editorKindPicker(editor) : null,
      h(
        "label",
        { class: "editor-field" },
        h("span", {}, editor.kind === "kv" ? "Key" : "Document"),
        h("input", keyAttrs),
      ),
      h(
        "label",
        { class: "editor-field editor-field-block" },
        h("span", {}, editor.kind === "kv" ? "Value" : "JSON"),
        h("textarea", valueAttrs, editor.value),
      ),
      editor.error ? h("div", { class: "write-error" }, editor.error) : null,
      h(
        "div",
        { class: "editor-actions" },
        h("button", saveAttrs, h("span", { class: "codicon codicon-check", "aria-hidden": "true" }), editor.saving ? "Saving" : "Save"),
        h("button", cancelAttrs, "Cancel"),
      ),
    );
  }

  private editorKindPicker(editor: EditorState): HTMLElement {
    return h(
      "div",
      { class: "segmented editor-kind", role: "radiogroup", "aria-label": "Object type" },
      ...(["kv", "json"] as const).map((kind) =>
        h(
          "button",
          {
            class: `seg${editor.kind === kind ? " active" : ""}`,
            role: "radio",
            "aria-checked": String(editor.kind === kind),
            onclick: () => {
              if (!this.editor) return;
              this.editor.kind = kind;
              this.editor.error = null;
              this.render();
            },
          },
          h("span", { class: `codicon codicon-${kind === "kv" ? "symbol-key" : "json"}`, "aria-hidden": "true" }),
          kind === "kv" ? "Key" : "Document",
        ),
      ),
    );
  }

  private async saveEditor(): Promise<void> {
    const editor = this.editor;
    if (!editor) return;
    const key = editor.key.trim();
    if (!key) {
      this.setEditorError(editor.kind === "kv" ? "Key is required." : "Document id is required.");
      return;
    }
    if (editor.kind === "json") {
      try {
        JSON.parse(editor.value);
      } catch (error) {
        this.setEditorError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }
    editor.saving = true;
    editor.error = null;
    this.render();
    try {
      const result = await this.rpc.request<WriteResultData>(
        editor.kind === "json"
          ? { op: "json-set", docId: key, valueText: editor.value }
          : editor.keyB64
            ? { op: "kv-put-key", keyB64: editor.keyB64, valueText: editor.value }
            : { op: "kv-put-text", keyText: key, valueText: editor.value },
      );
      this.toast = result.message;
      this.editor = null;
      await this.reload();
      setTimeout(() => {
        if (this.toast !== result.message) return;
        this.toast = null;
        this.render();
      }, 3_000);
    } catch (error) {
      if (!this.editor) return;
      this.editor.saving = false;
      this.editor.error = errorMessage(error);
      this.render();
    }
  }

  private setEditorError(message: string): void {
    if (!this.editor) return;
    this.editor.error = message;
    this.editor.saving = false;
    this.render();
  }

  private changeFilter(filter: SpaceFilter): void {
    this.filter = filter;
    this.selected = null;
    this.detail = null;
    void this.loadPage(null, true);
  }

  private visibleRows(): SpaceItem[] {
    const query = this.keyFilter.trim();
    const matched = this.rows
      .map((row, index) => ({ row, index, score: matchScore(row.label, query) }))
      .filter((match): match is { row: SpaceItem; index: number; score: number } => match.score !== null);
    if (this.sortMode === "default") {
      if (!query) return this.rows;
      return matched
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map((match) => match.row);
    }
    return matched
      .sort((a, b) => this.compareRows(a.row, b.row) || a.index - b.index)
      .map((match) => match.row);
  }

  private clearHiddenSelection(): void {
    if (!this.selected) return;
    if (this.visibleRows().some((row) => row.id === this.selected?.id)) return;
    this.selected = null;
    this.detail = null;
  }

  private clearSearch(): void {
    const wasSearchFocused = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("key-filter");
    this.keyFilter = "";
    this.clearHiddenSelection();
    this.render();
    if (wasSearchFocused) this.focusSearch();
  }

  private typeCounts(): Record<SpaceFilter, number> {
    const counts: Record<SpaceFilter, number> = {
      all: this.rows.length,
      kv: 0,
      json: 0,
      events: 0,
      vectors: 0,
      graphs: 0,
    };
    for (const row of this.rows) {
      counts[filterForRow(row)] += 1;
    }
    return counts;
  }

  private compareRows(a: SpaceItem, b: SpaceItem): number {
    const direction = this.sortDir === "asc" ? 1 : -1;
    switch (this.sortMode) {
      case "name":
        return direction * compareText(a.label, b.label);
      case "type":
        return direction * (KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareText(a.label, b.label));
      case "version":
        return compareNullableNumber(a.version, b.version, direction) || compareText(a.label, b.label);
      case "time":
        return compareNullableNumber(a.timestamp, b.timestamp, direction) || compareText(a.label, b.label);
      case "default":
        return 0;
    }
  }

  private onKeyDown(event: Event): void {
    const e = event as KeyboardEvent;
    const target = e.target as HTMLElement | null;
    const isTextInput =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (target instanceof HTMLInputElement && target.classList.contains("key-filter") && e.key === "Escape" && this.keyFilter) {
      e.preventDefault();
      this.clearSearch();
      return;
    }
    if (isTextInput) return;

    if (e.key === "/") {
      e.preventDefault();
      this.focusSearch(true);
      return;
    }
    if (e.key === "Escape" && this.keyFilter) {
      e.preventDefault();
      this.clearSearch();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.moveSelection(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && this.selected) {
      void navigator.clipboard.writeText(this.selected.label);
    }
  }

  private focusSearch(select = false): void {
    const input = this.root.querySelector<HTMLInputElement>(".key-filter");
    input?.focus();
    if (select) input?.select();
  }

  private moveSelection(delta: number): void {
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    const selectedIndex = this.selected ? rows.findIndex((row) => row.id === this.selected?.id) : -1;
    const nextIndex =
      selectedIndex === -1
        ? delta > 0 ? 0 : rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, selectedIndex + delta));
    void this.select(rows[nextIndex]!);
  }

  private focusSelectedRow(): void {
    if (!this.selected) return;
    const row = [...this.root.querySelectorAll<HTMLElement>("tbody tr")]
      .find((el) => el.dataset.rowId === this.selected?.id);
    row?.focus();
  }

  private filterEmptyEl(): HTMLElement {
    const query = this.keyFilter.trim();
    return h(
      "div",
      { class: "filter-empty" },
      h("span", { class: "codicon codicon-search-stop", "aria-hidden": "true" }),
      h(
        "span",
        { class: "filter-empty-message" },
        this.hasMore
          ? `No loaded objects match "${query}". Load the next page to continue the search.`
          : `No objects match "${query}".`,
      ),
      h(
        "span",
        { class: "filter-empty-actions" },
        this.hasMore
          ? h("button", { class: "quiet-button", onclick: () => void this.loadPage(this.cursor) }, "Load more")
          : null,
        h("button", { class: "quiet-button", onclick: () => this.clearSearch() }, "Clear"),
      ),
    );
  }

  private tableEl(rows: SpaceItem[]): HTMLElement {
    const table = h(
      "table",
      { class: "space-table" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          this.sortHeader("type", "type", "col-type"),
          this.sortHeader("name", "name", "col-name"),
          h("th", { class: "col-preview" }, "preview"),
          this.sortHeader("version", "version", "col-version"),
          this.sortHeader("time", "time", "col-time"),
        ),
      ),
    );
    const body = h("tbody", {});
    for (const row of rows) {
      body.append(
        h(
          "tr",
          {
            class: row.id === this.selected?.id ? "selected" : "",
            "data-row-id": row.id,
            "data-kind": row.kind,
            tabindex: "0",
            "aria-label": `${row.kind} ${row.label}`,
            onclick: () => void this.select(row),
            onkeydown: (e) => {
              if ((e as KeyboardEvent).key === "Enter") void this.select(row);
            },
          },
          h("td", { class: "cell-type" }, typeCell(row)),
          h("td", { class: "cell-key" }, highlightedLabel(row.label, this.keyFilter)),
          h("td", { class: "cell-preview" }, row.preview),
          h("td", { class: "cell-version" }, row.version === null ? "-" : String(row.version)),
          h("td", { class: "cell-time" }, rowTimeEl(row)),
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
    this.focusSelectedRow();
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
      this.focusSelectedRow();
    } catch (error) {
      this.renderError(error);
    }
  }

  private detailInner(): HTMLElement[] {
    if (this.editor) return [this.editorEl()];
    if (!this.selected) {
      return [
        h(
          "div",
          { class: "detail-placeholder" },
          h("span", { class: "codicon codicon-layout-sidebar-right", "aria-hidden": "true" }),
          h("div", { class: "detail-placeholder-title" }, "Select an object"),
          h("div", { class: "detail-placeholder-body" }, "Details, values, and history appear here."),
        ),
      ];
    }
    if (!this.detail) {
      return [
        h(
          "div",
          { class: "detail-loading" },
          h("span", { class: "codicon codicon-sync", "aria-hidden": "true" }),
          "Loading details",
        ),
      ];
    }
    const row = this.selected;
    const head = h(
      "div",
      { class: "detail-head" },
      h(
        "span",
        { class: `type-pill type-${row.kind}` },
        h("span", { class: `codicon codicon-${typeIcon(row.kind)}`, "aria-hidden": "true" }),
        typeLabel(row.kind),
      ),
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
      h(
        "button",
        {
          class: "icon-button",
          title: "Copy name",
          onclick: (e) => {
            void navigator.clipboard.writeText(row.label);
            flashCopied(e.currentTarget as HTMLElement);
          },
        },
        h("span", { class: "codicon codicon-copy", "aria-hidden": "true" }),
      ),
      row.version === null ? null : h("span", { class: "chip" }, `v${row.version}`),
      row.timestamp === null ? null : rowTimeEl(row),
      this.detailActionButtons(row),
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
        what: "Couldn't load objects",
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
      return "Key";
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

function filterForRow(row: SpaceItem): SpaceFilter {
  switch (row.kind) {
    case "kv":
      return "kv";
    case "json":
      return "json";
    case "event":
      return "events";
    case "vector-collection":
      return "vectors";
    case "graph":
      return "graphs";
  }
}

function rowTimeEl(row: SpaceItem): HTMLElement | string {
  if (row.timestamp === null) return "-";
  return row.kind === "event" ? timeEl(row.timestamp) : commitTimeEl(row.timestamp, row.committedAt);
}

function normalizeKeyFilter(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s._:-]+/g, "");
}

function matchScore(label: string, query: string): number | null {
  const needle = normalizeKeyFilter(query);
  if (!needle) return 0;
  const haystack = normalizeKeyFilter(label);
  const index = haystack.indexOf(needle);
  if (index === 0) return 0;
  if (index > 0) return 10 + index;
  const fuzzy = fuzzyIndexes(label, needle);
  if (!fuzzy) return null;
  const gapScore = fuzzyGapScore(label, fuzzy);
  return gapScore === null ? null : 100 + fuzzy[0]! + gapScore;
}

function highlightedLabel(label: string, query: string): Node {
  const needle = query.trim();
  if (!needle) return document.createTextNode(label);
  const index = label.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index === -1) {
    const fuzzy = fuzzyIndexes(label, normalizeKeyFilter(needle));
    if (!fuzzy) return document.createTextNode(label);
    const wrapper = h("span", { class: "key-label" });
    const marked = new Set(fuzzy);
    let buffer = "";
    let marking = false;
    const flush = () => {
      if (!buffer) return;
      wrapper.append(marking ? h("mark", { class: "match" }, buffer) : document.createTextNode(buffer));
      buffer = "";
    };
    for (let charIndex = 0; charIndex < label.length; charIndex += 1) {
      const shouldMark = marked.has(charIndex);
      if (charIndex > 0 && shouldMark !== marking) flush();
      marking = shouldMark;
      buffer += label[charIndex]!;
    }
    flush();
    return wrapper;
  }
  return h(
    "span",
    { class: "key-label" },
    label.slice(0, index),
    h("mark", { class: "match" }, label.slice(index, index + needle.length)),
    label.slice(index + needle.length),
  );
}

function fuzzyIndexes(label: string, normalizedNeedle: string): number[] | null {
  if (!normalizedNeedle) return [];
  const indexes: number[] = [];
  let needleIndex = 0;
  for (let index = 0; index < label.length && needleIndex < normalizedNeedle.length; index += 1) {
    const normalizedChar = normalizeKeyFilter(label[index]!);
    if (!normalizedChar) continue;
    if (normalizedChar === normalizedNeedle[needleIndex]) {
      indexes.push(index);
      needleIndex += 1;
    }
  }
  return needleIndex === normalizedNeedle.length ? indexes : null;
}

function fuzzyGapScore(label: string, indexes: number[]): number | null {
  let total = 0;
  for (let position = 1; position < indexes.length; position += 1) {
    const previous = indexes[position - 1]!;
    const current = indexes[position]!;
    const gap = Math.max(0, current - previous - 1);
    const boundary = isWordBoundary(label, current);
    if (gap > 3 && !boundary) return null;
    total += boundary ? Math.min(gap, 1) : gap;
  }
  return total;
}

function isWordBoundary(label: string, index: number): boolean {
  if (index <= 0) return true;
  const previous = label[index - 1]!;
  const current = label[index]!;
  return /[\s._:-]/.test(previous) || (previous.toLocaleLowerCase() === previous && current.toLocaleUpperCase() === current);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareNullableNumber(a: number | null, b: number | null, direction: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a - b);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
