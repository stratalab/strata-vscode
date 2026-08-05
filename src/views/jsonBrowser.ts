/**
 * JSON document browser (F4.2): doc list, collapsible tree with copyable
 * path breadcrumbs, read-only index listing, and the two-version structural
 * diff — the time-travel payoff made visible.
 */
import { clear, h, microsToIso } from "./shared/dom";
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

  render(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    const facts = `${this.docs.length} loaded${this.total !== null ? ` of ${this.total}` : ""}${this.hasMore ? " — more available" : ""}`;
    const list = h("div", { class: "doc-list" });
    for (const docId of this.docs) {
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

    this.root.append(
      scopeBanner(scope, facts, scope.asOfLabel ? () => void this.rpc.request({ op: "scrub", micros: null }) : null),
      h("div", { class: "split" }, list, this.docEl()),
      this.indexesEl(),
    );
  }

  private docEl(): HTMLElement {
    if (!this.selected) return h("div", { class: "detail-empty" }, "select a document");
    if (!this.doc) return h("div", { class: "detail-loading" }, "loading…");
    if (!this.doc.found) return h("div", { class: "detail" }, "document not found at this position");

    const marks =
      this.diffAgainst !== null ? structuralDiff(this.diffValue, this.doc.value) : null;
    const container = h("div", { class: "doc-detail" });
    if (this.diffAgainst !== null) {
      container.append(
        h(
          "div",
          { class: "diff-note" },
          `structural diff vs ${microsToIso(this.diffAgainst)} — `,
          h("span", { class: "diff-added" }, "added "),
          h("span", { class: "diff-removed" }, "removed "),
          h("span", { class: "diff-changed" }, "changed"),
          h("button", { onclick: () => { this.diffAgainst = null; this.render(); } }, "clear"),
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
    const list = h(
      "div",
      { class: "timeline" },
      h("div", { class: "timeline-title" }, "history — diff shows changes against that version"),
    );
    for (const entry of timeline.entries) {
      list.append(
        h(
          "button",
          { class: `timeline-entry${entry.tombstone ? " tombstone" : ""}`, onclick: () => void this.diffWith(entry.timestamp) },
          `v${entry.version} · ${microsToIso(entry.timestamp)}${entry.tombstone ? " · deleted" : ""}`,
        ),
      );
    }
    return list;
  }

  private indexesEl(): HTMLElement {
    if (this.indexes == null) return h("div", {});
    return h(
      "details",
      { class: "indexes" },
      h("summary", {}, "secondary indexes (read-only)"),
      jsonTree(this.indexes, "$.indexes", (p) => void navigator.clipboard.writeText(p)),
    );
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, null),
      h("div", { class: "error" }, `error: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}
