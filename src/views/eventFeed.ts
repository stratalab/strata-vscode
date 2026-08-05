/**
 * Event feed (F4.3): chronological, append-only, newest at the bottom,
 * paged backward from the head, filtered by type. Live ticks append in
 * place — the "watch your agent think" moment. Chain position shows per
 * entry; verify-chain renders its integrity result inline.
 */
import { clear, h, microsToIso } from "./shared/dom";
import { scopeBanner } from "./shared/banner";
import { jsonTree } from "./shared/jsonTree";
import type { ViewRpc } from "./shared/rpc";
import type { ChainVerificationData, EventPageData } from "./shared/messages";

type FeedEntry = EventPageData["items"][number];

export class EventFeedView {
  private entries: FeedEntry[] = [];
  private earlier: number | null = null;
  private total: number | null = null;
  private types: string[] = [];
  private typeFilter: string | null = null;
  private verification: ChainVerificationData | null = null;
  private expanded = new Set<number>();

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
  ) {
    // Live append (F4.3): on a tick, pull anything newer than the tail.
    rpc.onScopeChange(() => void this.pullLatest());
  }

  async reload(): Promise<void> {
    this.entries = [];
    this.earlier = null;
    this.verification = null;
    try {
      const [page, types] = await Promise.all([
        this.rpc.request<EventPageData>({ op: "event-head", eventType: this.typeFilter }),
        this.rpc.request<{ types?: string[] } | string[]>({ op: "event-types" }).catch(() => []),
      ]);
      this.entries = page.items;
      this.earlier = page.earlier;
      this.total = page.total;
      this.types = Array.isArray(types) ? types.map(String) : (types.types ?? []).map(String);
      this.render();
      this.scrollToBottom();
    } catch (error) {
      this.renderError(error);
    }
  }

  /** Tick-driven: fetch the head again and append what's new, in place. */
  private async pullLatest(): Promise<void> {
    if (this.rpc.scope?.asOfLabel) {
      // Scrubbed: the feed is historical; live append stays suspended (F2.2).
      await this.reload();
      return;
    }
    try {
      const page = await this.rpc.request<EventPageData>({ op: "event-head", eventType: this.typeFilter });
      const lastSeq = this.entries.length > 0 ? this.entries[this.entries.length - 1]!.sequence : -1;
      const fresh = page.items.filter((item) => item.sequence > lastSeq);
      if (fresh.length > 0) {
        this.entries = [...this.entries, ...fresh];
        this.total = page.total;
        this.render();
        this.scrollToBottom();
      }
    } catch {
      // transient — the next tick retries
    }
  }

  private async loadEarlier(): Promise<void> {
    if (this.earlier === null) return;
    const page = await this.rpc.request<EventPageData>({
      op: "event-head",
      beforeSeq: this.earlier,
      eventType: this.typeFilter,
    });
    this.entries = [...page.items, ...this.entries];
    this.earlier = page.earlier;
    this.render();
  }

  private async verifyChain(): Promise<void> {
    this.verification = await this.rpc.request<ChainVerificationData>({ op: "verify-chain" });
    this.render();
  }

  render(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    const facts = `${this.entries.length} shown${this.total !== null ? ` of ${this.total}` : ""}`;

    const typePicker = h(
      "select",
      {
        class: "type-filter",
        "aria-label": "filter by event type",
        onchange: (e) => {
          const value = (e.target as HTMLSelectElement).value;
          this.typeFilter = value === "" ? null : value;
          void this.reload();
        },
      },
      h("option", { value: "" }, "all types"),
      ...this.types.map((t) =>
        this.typeFilter === t
          ? h("option", { value: t, selected: "" }, t)
          : h("option", { value: t }, t),
      ),
    );

    const feed = h("div", { class: "feed", id: "feed" });
    if (this.earlier !== null) {
      feed.append(
        h("button", { class: "load-more", onclick: () => void this.loadEarlier() }, "Load earlier events…"),
      );
    }
    for (const entry of this.entries) {
      feed.append(this.entryEl(entry));
    }

    this.root.append(
      scopeBanner(scope, facts, scope.asOfLabel ? () => void this.rpc.request({ op: "scrub", micros: null }) : null),
      h(
        "div",
        { class: "toolbar" },
        typePicker,
        h("button", { onclick: () => void this.verifyChain() }, "verify chain"),
        this.verificationEl(),
      ),
      feed,
    );
  }

  private entryEl(entry: FeedEntry): HTMLElement {
    const open = this.expanded.has(entry.sequence);
    const container = h(
      "div",
      { class: "event-entry" },
      h(
        "div",
        {
          class: "event-head",
          tabindex: "0",
          role: "button",
          "aria-expanded": String(open),
          "aria-label": `event ${entry.sequence} ${entry.eventType}`,
          onclick: () => {
            if (open) this.expanded.delete(entry.sequence);
            else this.expanded.add(entry.sequence);
            this.render();
          },
          onkeydown: (e) => {
            if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
              e.preventDefault();
              if (open) this.expanded.delete(entry.sequence);
              else this.expanded.add(entry.sequence);
              this.render();
            }
          },
        },
        h("span", { class: "event-seq", title: "chain position" }, `#${entry.sequence}`),
        h("span", { class: "event-type" }, entry.eventType),
        h("span", { class: "event-time" }, microsToIso(entry.timestamp)),
      ),
    );
    if (open) {
      container.append(
        jsonTree(entry.payload, "$", (p) => void navigator.clipboard.writeText(p)),
        h("div", { class: "event-hashes" }, `hash ${entry.hash.slice(0, 16)}… ← prev ${entry.previousHash.slice(0, 16)}…`),
      );
    }
    return container;
  }

  private verificationEl(): HTMLElement {
    const v = this.verification;
    if (!v) return h("span", {});
    return h(
      "span",
      { class: v.valid ? "chain-ok" : "chain-bad" },
      v.valid
        ? ` chain intact (${v.length} events)`
        : ` chain BROKEN at #${v.firstInvalid ?? "?"}${v.error ? ` — ${v.error}` : ""}`,
    );
  }

  private scrollToBottom(): void {
    const feed = this.root.querySelector("#feed");
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, null),
      h("div", { class: "error" }, `error: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}
