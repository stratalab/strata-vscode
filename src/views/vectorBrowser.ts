/**
 * Vector collection browser (F4.4): collection cards, then a metadata-first
 * entry table — float payloads arrive summarized (dimensions, norm) and are
 * never dumped. Per-entry history via vector.history. The 2D projection
 * scatter is the flagged stretch goal and is not built (first to cut).
 */
import { clear, h, microsToIso } from "./shared/dom";
import { scopeBanner } from "./shared/banner";
import type { ViewRpc } from "./shared/rpc";
import type { TimelineData, VectorCollectionsData, VectorPageData } from "./shared/messages";

export class VectorBrowserView {
  private collections: VectorCollectionsData["items"] = [];
  private active: string | null = null;
  private page: VectorPageData | null = null;
  private rows: VectorPageData["items"] = [];
  private timelineFor: string | null = null;
  private timeline: TimelineData | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
  ) {
    rpc.onScopeChange(() => void this.reload());
  }

  async reload(): Promise<void> {
    this.active = null;
    this.page = null;
    this.rows = [];
    try {
      const data = await this.rpc.request<VectorCollectionsData>({ op: "vector-collections" });
      this.collections = data.items;
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  private async openCollection(name: string, cursor: string | null = null): Promise<void> {
    this.active = name;
    const page = await this.rpc.request<VectorPageData>({ op: "vector-page", collection: name, cursor });
    this.rows = cursor === null ? page.items : [...this.rows, ...page.items];
    this.page = page;
    this.render();
  }

  private async history(key: string): Promise<void> {
    if (!this.active) return;
    this.timelineFor = key;
    this.timeline = await this.rpc.request<TimelineData>({
      op: "vector-history",
      collection: this.active,
      key,
    });
    this.render();
  }

  render(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    const facts = this.active
      ? `${this.rows.length} entries loaded${this.page?.hasMore ? " — more available" : ""}`
      : `${this.collections.length} collections`;

    const cards = h("div", { class: "cards" });
    for (const info of this.collections) {
      cards.append(
        h(
          "button",
          {
            class: `card${info.name === this.active ? " selected" : ""}`,
            onclick: () => void this.openCollection(info.name),
          },
          h("div", { class: "card-title" }, info.name),
          h("div", { class: "card-meta" }, `${info.count} vectors · ${info.dimension}d · ${info.metric}`),
        ),
      );
    }

    this.root.append(
      scopeBanner(scope, facts, scope.asOfLabel ? () => void this.rpc.request({ op: "scrub", micros: null }) : null),
      cards,
      this.tableEl(),
    );
  }

  private tableEl(): HTMLElement {
    if (!this.active || !this.page) return h("div", { class: "detail-empty" }, "select a collection");
    const table = h(
      "table",
      { class: "vector-table" },
      h(
        "thead",
        {},
        h("tr", {}, h("th", {}, "key"), h("th", {}, "dims"), h("th", {}, "‖v‖"), h("th", {}, "metadata"), h("th", {}, "version"), h("th", {}, "")),
      ),
    );
    const body = h("tbody", {});
    for (const row of this.rows) {
      body.append(
        h(
          "tr",
          {},
          h("td", {}, row.key),
          h("td", {}, String(row.dimension)),
          h("td", {}, row.norm.toFixed(4)),
          h("td", { class: "cell-preview" }, row.metadataPreview ?? "—"),
          h("td", {}, String(row.version)),
          h("td", {}, h("button", { onclick: () => void this.history(row.key) }, "history")),
        ),
      );
      if (this.timelineFor === row.key && this.timeline) {
        body.append(
          h("tr", {}, h("td", { colspan: "6" }, this.timelineEl())),
        );
      }
    }
    table.append(body);
    const wrap = h("div", { class: "table-scroll" }, table);
    if (this.page.hasMore) {
      wrap.append(
        h(
          "button",
          { class: "load-more", onclick: () => void this.openCollection(this.active!, this.page!.cursor) },
          `Load more (${this.rows.length} loaded)`,
        ),
      );
    }
    return wrap;
  }

  private timelineEl(): HTMLElement {
    const timeline = this.timeline!;
    if (timeline.kind === "unavailable") {
      return h("div", { class: "retention" }, `history unavailable: ${timeline.reason ?? ""}`);
    }
    return h(
      "div",
      { class: "timeline" },
      ...timeline.entries.map((entry) =>
        h(
          "span",
          { class: "timeline-chip" },
          `v${entry.version} · ${microsToIso(entry.timestamp)}${entry.tombstone ? " · deleted" : ""}`,
        ),
      ),
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
