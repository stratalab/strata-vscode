/**
 * JSON document browser (F4.2): doc list, collapsible tree with copyable
 * path breadcrumbs, read-only index listing, and the two-version structural
 * diff — the time-travel payoff made visible.
 */
import { clear, flashCopied, h, preservingScroll, timeEl } from "./shared/dom";
import { emptyState, loadingState, requestFailed } from "./shared/states";
import { formatCount } from "./shared/format";
import { strataRail } from "./shared/rail";
import { scopeBanner } from "./shared/banner";
import { jsonTree } from "./shared/jsonTree";
import { structuralDiff } from "./shared/jsonDiff";
import type { ViewRpc } from "./shared/rpc";
import type { JsonDocData, JsonPageData, TimelineData } from "./shared/messages";

export class JsonBrowserView {
  private docs: string[] = [];
  private cursor: string | null = null;
  private hasMore = false;
  private total: number | null = null;
  private selected: string | null = null;
  private docFilter = "";
  private doc: JsonDocData | null = null;
  private timeline: TimelineData | null = null;
  private diffAgainst: number | null = null; // timestamp of the compared version
  private diffValue: unknown = undefined;
  private indexes: unknown = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
  ) {
    rpc.onScopeChange(() => void this.reload());
  }

  async reload(): Promise<void> {
    this.docs = [];
    this.cursor = null;
    this.selected = null;
    this.doc = null;
    this.timeline = null;
    this.diffAgainst = null;
    if (!this.root.hasChildNodes()) this.renderLoading();
    try {
      const [page, indexes] = await Promise.all([
        this.rpc.request<JsonPageData>({ op: "json-page" }),
        this.rpc.request<unknown>({ op: "json-indexes" }).catch(() => null),
      ]);
      this.docs = page.items;
      this.cursor = page.cursor;
      this.hasMore = page.hasMore;
      this.total = page.total;
      this.indexes = indexes;
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  private async loadMore(): Promise<void> {
    const page = await this.rpc.request<JsonPageData>({ op: "json-page", cursor: this.cursor });
    this.docs = [...this.docs, ...page.items];
    this.cursor = page.cursor;
    this.hasMore = page.hasMore;
    this.render();
  }

  private async select(docId: string): Promise<void> {
    this.selected = docId;
    this.doc = null;
    this.timeline = null;
    this.diffAgainst = null;
    this.render();
    this.doc = await this.rpc.request<JsonDocData>({ op: "json-doc", docId });
    this.timeline = await this.rpc.request<TimelineData>({ op: "json-history", docId });
    this.render();
  }

  private async diffWith(timestamp: number): Promise<void> {
    if (!this.selected) return;
    const older = await this.rpc.request<JsonDocData>({
      op: "json-doc-at",
      docId: this.selected,
      asOfMicros: timestamp,
    });
    this.diffAgainst = timestamp;
    this.diffValue = older.value;
    this.render();
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

  render(): void {
    preservingScroll(this.root, () => this.renderContent());
  }

  private renderContent(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    if (this.docs.length === 0 && !this.hasMore) {
      this.root.append(
        scopeBanner(scope, null, this.backToNow()),
        emptyState(
          "json",
          "No documents in this space yet",
          "Documents written by the owning app appear here the moment they land — this view follows the database live.",
        ),
      );
      return;
    }
    const facts = `${formatCount(this.docs.length)} loaded${this.total !== null ? ` of ${formatCount(this.total)}` : ""}${this.hasMore ? " — more available" : ""}`;
    const needle = this.docFilter.toLowerCase();
    const shown = needle ? this.docs.filter((d) => d.toLowerCase().includes(needle)) : this.docs;
    const list = h("div", { class: "doc-list" });
    for (const docId of shown) {
      list.append(
        h(
          "button",
          {
            class: `doc-item${docId === this.selected ? " selected" : ""}`,
            onclick: () => void this.select(docId),
          },
          docId,
        ),
      );
    }
    if (this.hasMore) {
      list.append(h("button", { class: "load-more", onclick: () => void this.loadMore() }, "Load more…"));
    }

    const pane = h(
      "div",
      { class: "doc-pane" },
      h(
        "div",
        { class: "list-head" },
        `Documents · ${formatCount(this.docs.length)}${this.docFilter ? ` · ${formatCount(shown.length)} match` : ""}`,
      ),
      h("input", {
        class: "filter",
        "aria-label": "Filter documents",
        placeholder: "Filter documents…",
        value: this.docFilter,
        oninput: (e) => {
          this.docFilter = (e.target as HTMLInputElement).value;
          this.render();
        },
      }),
      list,
    );

    this.root.append(
      scopeBanner(scope, facts, this.backToNow()),
      h("div", { class: "split" }, pane, this.docEl()),
      this.indexesEl(),
    );
  }

  private docEl(): HTMLElement {
    if (!this.selected) return h("div", { class: "detail-empty" }, "Select a document");
    if (!this.doc) return h("div", { class: "detail-loading" }, "Loading…");
    if (!this.doc.found) return h("div", { class: "detail" }, "Document not found at this position.");

    const marks =
      this.diffAgainst !== null ? structuralDiff(this.diffValue, this.doc.value) : null;
    const container = h("div", { class: "doc-detail" });
    const setAll = (open: boolean) =>
      container.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = open));
    container.append(
      h(
        "div",
        { class: "doc-head" },
        h(
          "span",
          {
            class: "doc-id",
            title: "copy id",
            onclick: (e) => {
              void navigator.clipboard.writeText(this.selected!);
              flashCopied(e.currentTarget as HTMLElement);
            },
          },
          this.selected!,
        ),
        h("span", { class: "doc-tools" },
          h("button", { class: "tree-tool", onclick: () => setAll(true) }, "Expand all"),
          h("button", { class: "tree-tool", onclick: () => setAll(false) }, "Collapse all"),
        ),
      ),
    );
    if (this.diffAgainst !== null && marks !== null) {
      const counts = { added: 0, removed: 0, changed: 0 };
      marks.forEach((kind) => (counts[kind] += 1));
      container.append(
        h(
          "div",
          { class: "diff-note" },
          h("span", { class: "chip chip-added" }, `+${counts.added} added`),
          h("span", { class: "chip chip-removed" }, `−${counts.removed} removed`),
          h("span", { class: "chip chip-changed" }, `~${counts.changed} changed`),
          " vs ",
          timeEl(this.diffAgainst),
          h("button", { class: "diff-exit", onclick: () => { this.diffAgainst = null; this.render(); } }, "Exit diff"),
        ),
      );
    }
    container.append(jsonTree(this.doc.value, "$", (p) => void navigator.clipboard.writeText(p), marks));
    container.append(this.timelineEl());
    return container;
  }

  private timelineEl(): HTMLElement {
    const timeline = this.timeline;
    if (!timeline) return h("div", {});
    if (timeline.kind === "unavailable") {
      return h("div", { class: "retention" }, `history unavailable: ${timeline.reason ?? ""}`);
    }
    return strataRail(timeline.entries, {
      title: "History",
      verb: "Compare with current",
      activeMicros: this.diffAgainst,
      onPick: (entry) => void this.diffWith(entry.timestamp),
    });
  }

  private indexesEl(): HTMLElement {
    if (this.indexes == null) return h("div", {});
    return h(
      "details",
      { class: "indexes" },
      h(
        "summary",
        { title: "Read-only — indexes are maintained by the owning app" },
        "Secondary indexes",
      ),
      jsonTree(this.indexes, "$.indexes", (p) => void navigator.clipboard.writeText(p)),
    );
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, this.backToNow()),
      requestFailed(error, {
        what: "Couldn't load documents",
        onRetry: () => void this.reload(),
        onBackToNow: this.backToNow(),
        onOpenDocs: (code) => void this.rpc.request({ op: "open-docs", code }),
      }),
    );
  }
}
