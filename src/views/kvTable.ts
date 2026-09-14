/**
 * KV table view (F4.1): sortable columns, filter over loaded rows plus a
 * prefix query (kv.list `prefix`), value inspector with text/JSON/hex toggles
 * (bytes never guess silently), and a per-key history timeline that drives
 * the scrubber.
 */
import { byteEl, clear, commitTimeEl, flashCopied, h, preservingScroll } from "./shared/dom";
import { emptyState, loadingState, requestFailed } from "./shared/states";
import { formatCount, formatHexDump } from "./shared/format";
import { strataRail } from "./shared/rail";
import { scopeBanner } from "./shared/banner";
import { jsonTree } from "./shared/jsonTree";
import type { ViewRpc } from "./shared/rpc";
import type { KvPageData, KvValueData, TimelineData, ViewFocus } from "./shared/messages";

type SortKey = "key" | "version";

interface Row {
  keyB64: string;
  label: string;
  preview: string;
  version: number | null;
}

export class KvTableView {
  private rows: Row[] = [];
  private cursor: string | null = null;
  private hasMore = false;
  private total: number | null = null;
  private sortBy: SortKey = "key";
  private sortAsc = true;
  private filter = "";
  private jumpText = "";
  private rangeStartText: string | null = null;
  private selected: string | null = null;
  private detail: KvValueData | null = null;
  private detailForm: "auto" | "text" | "json" | "hex" = "auto";
  private timeline: TimelineData | null = null;
  private pendingFocus: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
    initialFocus: ViewFocus | null = null,
  ) {
    this.pendingFocus = initialFocus?.type === "kv-key" ? initialFocus.key : null;
    rpc.onScopeChange(() => void this.reload());
  }

  async reload(): Promise<void> {
    const focusKey = this.pendingFocus;
    this.pendingFocus = null;
    this.rows = [];
    this.cursor = null;
    this.selected = null;
    this.detail = null;
    this.timeline = null;
    if (focusKey) {
      this.rangeStartText = null;
      this.jumpText = "";
    }
    if (!this.root.hasChildNodes()) this.renderLoading();
    await this.loadPage(focusKey, true, this.rangeStartText);
    if (focusKey) await this.select(focusKey);
  }

  async focus(focus: ViewFocus): Promise<void> {
    if (focus.type !== "kv-key") return;
    this.pendingFocus = focus.key;
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

  private async loadPage(start: string | null, replace = false, startText: string | null = null): Promise<void> {
    try {
      const page = await this.rpc.request<KvPageData>({
        op: "kv-page",
        start,
        ...(startText ? { startText } : {}),
      });
      this.rows = replace ? page.items : [...this.rows, ...page.items];
      this.cursor = page.cursor;
      this.hasMore = page.hasMore;
      this.total = page.total;
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  private visibleRows(): Row[] {
    const needle = this.filter.toLowerCase();
    const filtered = needle
      ? this.rows.filter(
          (row) => row.label.toLowerCase().includes(needle) || row.preview.toLowerCase().includes(needle),
        )
      : [...this.rows];
    filtered.sort((a, b) => {
      const cmp =
        this.sortBy === "key"
          ? a.label.localeCompare(b.label)
          : (a.version ?? 0) - (b.version ?? 0);
      return this.sortAsc ? cmp : -cmp;
    });
    return filtered;
  }

  render(): void {
    preservingScroll(this.root, () => this.renderContent());
  }

  private renderContent(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    if (this.rows.length === 0 && !this.hasMore && !this.selected && !this.rangeStartText) {
      this.root.append(
        scopeBanner(scope, null, this.backToNow()),
        emptyState(
          "symbol-key",
          "No keys in this space yet",
          "Keys written by the owning app appear here the moment they land — this view follows the database live.",
        ),
      );
      return;
    }
    const visible = this.visibleRows();
    const range = this.rangeStartText ? ` for prefix "${this.rangeStartText}"` : "";
    const pageFacts = `${formatCount(this.rows.length)} loaded${range}${this.total !== null ? ` of ${formatCount(this.total)}` : ""}${this.hasMore ? " — next page available" : ""}`;
    this.root.append(
      scopeBanner(scope, pageFacts, this.backToNow()),
      h(
        "div",
        { class: "toolbar" },
        h(
          "form",
          {
            class: "kv-jump",
            onsubmit: (e) => {
              e.preventDefault();
              void this.jumpToStart();
            },
          },
          h("span", { class: "codicon codicon-search", "aria-hidden": "true" }),
          h("input", {
            class: "jump",
            "aria-label": "Search key prefix",
            placeholder: "Search prefix...",
            value: this.jumpText,
            oninput: (e) => {
              this.jumpText = (e.target as HTMLInputElement).value;
            },
          }),
          h(
            "button",
            { type: "submit", title: "Load keys with this prefix" },
            h("span", { class: "codicon codicon-arrow-right", "aria-hidden": "true" }),
            "Go",
          ),
          this.rangeStartText
            ? h(
                "button",
                {
                  type: "button",
                  title: "Return to first page",
                  onclick: () => {
                    this.jumpText = "";
                    void this.jumpToStart();
                  },
                },
                h("span", { class: "codicon codicon-debug-restart", "aria-hidden": "true" }),
                "First page",
              )
            : null,
        ),
        h("input", {
          class: "filter",
          "aria-label": "Filter loaded rows",
          placeholder: "Filter loaded rows…",
          value: this.filter,
          oninput: (e) => {
            this.filter = (e.target as HTMLInputElement).value;
            this.render();
          },
        }),
        this.filter
          ? h(
              "span",
              { class: "toolbar-note" },
              `${formatCount(visible.length)} of ${formatCount(this.rows.length)} loaded match${this.hasMore ? " — filters search loaded rows only" : ""}`,
            )
          : h("span", {}),
      ),
      h(
        "div",
        { class: "kv-body" },
        h(
          "div",
          { class: "kv-main" },
          this.tableEl(visible),
          visible.length === 0 && this.rangeStartText
            ? h(
                "div",
                { class: "filter-empty" },
                `No keys found for prefix "${this.rangeStartText}".`,
                h("button", {
                  onclick: () => {
                    this.jumpText = "";
                    void this.jumpToStart();
                  },
                }, "First page"),
              )
            : h("div", {}),
          visible.length === 0 && this.filter
            ? h(
                "div",
                { class: "filter-empty" },
                "No loaded rows match the filter.",
                h("button", { onclick: () => { this.filter = ""; this.render(); } }, "Clear filter"),
              )
            : h("div", {}),
          this.hasMore
            ? h(
                "button",
                { class: "load-more", onclick: () => void this.loadPage(this.cursor, false, this.rangeStartText) },
                `Load next page (${formatCount(this.rows.length)} loaded)`,
              )
            : h("div", {}),
        ),
        h("div", { class: "detail" }, ...this.detailInner()),
      ),
    );
  }

  private async jumpToStart(): Promise<void> {
    const startText = this.jumpText.trim();
    this.rangeStartText = startText || null;
    this.rows = [];
    this.cursor = null;
    this.selected = null;
    this.detail = null;
    this.timeline = null;
    await this.loadPage(null, true, this.rangeStartText);
  }

  private tableEl(visible: Row[]): HTMLElement {
    const header = (label: string, key: SortKey) => {
      const active = this.sortBy === key;
      return h(
        "th",
        {
          class: "sortable",
          "aria-sort": active ? (this.sortAsc ? "ascending" : "descending") : "none",
          onclick: () => {
            if (this.sortBy === key) this.sortAsc = !this.sortAsc;
            else {
              this.sortBy = key;
              this.sortAsc = true;
            }
            this.render();
          },
        },
        label,
        h("span", {
          class: `codicon codicon-arrow-${active && !this.sortAsc ? "down" : "up"} sort-glyph${active ? " on" : ""}`,
          "aria-hidden": "true",
        }),
      );
    };
    const table = h(
      "table",
      { class: "kv-table" },
      h("thead", {}, h("tr", {}, header("key", "key"), h("th", {}, "value"), header("version", "version"))),
    );
    const body = h("tbody", {});
    for (const row of visible) {
      body.append(
        h(
          "tr",
          {
            class: row.keyB64 === this.selected ? "selected" : "",
            tabindex: "0",
            "aria-label": `key ${row.label}`,
            onclick: () => void this.select(row.keyB64),
            onkeydown: (e) => {
              if ((e as KeyboardEvent).key === "Enter") void this.select(row.keyB64);
            },
          },
          h("td", { class: "cell-key" }, row.label),
          h("td", { class: "cell-preview" }, row.preview),
          h("td", { class: "cell-version" }, row.version === null ? "—" : String(row.version)),
        ),
      );
    }
    table.append(body);
    return h("div", { class: "table-scroll" }, table);
  }

  private async select(keyB64: string): Promise<void> {
    this.selected = keyB64;
    this.detail = null;
    this.timeline = null;
    this.render();
    try {
      this.detail = await this.rpc.request<KvValueData>({ op: "kv-value", key: keyB64 });
      this.timeline = await this.rpc.request<TimelineData>({ op: "kv-history", key: keyB64 });
    } catch (error) {
      this.renderError(error);
      return;
    }
    this.render();
  }

  private detailInner(): HTMLElement[] {
    if (!this.selected) return [h("div", { class: "detail-empty" }, "Select a row to inspect it")];
    const detail = this.detail;
    if (!detail) return [h("div", { class: "detail-loading" }, "Loading…")];
    if (!detail.found) return [h("div", { class: "detail-empty" }, "Not found at this position.")];

    const form =
      this.detailForm === "auto"
        ? detail.json !== null
          ? "json"
          : detail.text !== null
            ? "text"
            : "hex"
        : this.detailForm;
    const segment = (name: "text" | "json" | "hex", enabled: boolean, reason: string) =>
      h(
        "button",
        {
          class: `seg${form === name ? " active" : ""}${enabled ? "" : " disabled"}`,
          role: "radio",
          "aria-checked": String(form === name),
          ...(enabled ? {} : { "aria-disabled": "true", title: reason }),
          onclick: () => {
            if (!enabled) return;
            this.detailForm = name;
            this.render();
          },
        },
        name,
      );

    let body: HTMLElement;
    if (form === "json" && detail.json !== null) {
      body = jsonTree(detail.json, "$", (p) => void navigator.clipboard.writeText(p));
    } else if (form === "text" && detail.text !== null) {
      body = h("pre", { class: "detail-text" }, detail.text);
    } else {
      body = h("pre", { class: "detail-hex" }, formatHexDump(detail.hex));
    }

    const keyLabel = this.rows.find((row) => row.keyB64 === this.selected)?.label ?? keyLabelFromBase64(this.selected);
    return [
      h(
        "div",
        { class: "detail-head" },
        h(
          "span",
          {
            class: "detail-key",
            title: "copy key",
            onclick: (e) => {
              void navigator.clipboard.writeText(keyLabel);
              flashCopied(e.currentTarget as HTMLElement);
            },
          },
          keyLabel,
        ),
        h("span", { class: "chip" }, `v${detail.version}`),
        commitTimeEl(detail.timestamp, detail.committedAt),
        byteEl(detail.byteLength),
        h(
          "div",
          { class: "segmented", role: "radiogroup", "aria-label": "value form" },
          segment("text", detail.text !== null, "Not valid UTF-8"),
          segment("json", detail.json !== null, "Not valid JSON"),
          segment("hex", true, ""),
        ),
      ),
      body,
      this.timelineEl(),
    ];
  }

  private timelineEl(): HTMLElement {
    const timeline = this.timeline;
    if (!timeline) return h("div", {});
    if (timeline.kind === "unavailable") {
      return h("div", { class: "retention" }, `history unavailable: ${timeline.reason ?? ""}`);
    }
    return strataRail(timeline.entries, {
      title: "History",
      verb: "Scrub here",
      activeMicros: this.rpc.scope?.asOfMicros ?? null,
      onPick: (entry) => void this.rpc.request({ op: "scrub", micros: entry.timestamp }),
    });
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, this.backToNow()),
      requestFailed(error, {
        what: "Couldn't load keys",
        onRetry: () => void this.reload(),
        onBackToNow: this.backToNow(),
        onOpenDocs: (code) => void this.rpc.request({ op: "open-docs", code }),
      }),
    );
  }
}

function keyLabelFromBase64(value: string): string {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return text;
    return `0x${hexPreview(bytes, 16)}`;
  } catch {
    return value;
  }
}

function hexPreview(bytes: Uint8Array, max: number): string {
  const slice = [...bytes.subarray(0, max)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return bytes.length > max ? `${slice}...` : slice;
}
