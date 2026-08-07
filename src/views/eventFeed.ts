/**
 * Event feed (F4.3): chronological, append-only, newest at the bottom,
 * paged backward from the head, filtered by type. Live ticks append in
 * place — the "watch your agent think" moment.
 *
 * Follow mode (EV-1): the feed autoscrolls only while pinned to the
 * bottom. Scroll up to read and arrivals accumulate behind a "new events"
 * pill instead of ripping the viewport away; the pill jumps and re-pins.
 * Fresh entries wear the SIG-3 arrival fade. Chain verification renders as
 * a status chip; a broken chain names its first bad sequence and jumps to
 * it (EV-3).
 */
import { clear, h, preservingScroll } from "./shared/dom";
import { emptyState, loadingState, requestFailed } from "./shared/states";
import { exactMicros, formatCount, formatMicros } from "./shared/format";
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
  /** Follow mode: true while the viewport rests at the bottom (EV-1). */
  private pinned = true;
  private pendingNew = 0;
  /** Sequences that arrived on the last tick — they wear the fade once. */
  private freshSeqs = new Set<number>();

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
    this.pinned = true;
    this.pendingNew = 0;
    if (!this.root.hasChildNodes()) this.renderLoading();
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
      if (fresh.length === 0) return;
      this.entries = [...this.entries, ...fresh];
      this.total = page.total;
      this.freshSeqs = new Set(fresh.map((item) => item.sequence));
      if (this.pinned) {
        this.render();
        this.scrollToBottom();
      } else {
        // Reading upstream: never steal the viewport (EV-1).
        this.pendingNew += fresh.length;
        this.render();
      }
      this.freshSeqs = new Set();
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
    const facts = `${formatCount(this.entries.length)} shown${this.total !== null ? ` of ${formatCount(this.total)}` : ""}`;

    // Honest counts: tallies cover the loaded window, and only when the
    // window isn't already narrowed to one type (EV-4).
    const tally = new Map<string, number>();
    if (!this.typeFilter) {
      for (const entry of this.entries) tally.set(entry.eventType, (tally.get(entry.eventType) ?? 0) + 1);
    }
    const optionLabel = (t: string) => {
      const n = tally.get(t);
      return n !== undefined ? `${t} · ${formatCount(n)} loaded` : t;
    };
    const typePicker = h(
      "select",
      {
        class: "type-filter",
        "aria-label": "Filter by event type",
        onchange: (e) => {
          const value = (e.target as HTMLSelectElement).value;
          this.typeFilter = value === "" ? null : value;
          void this.reload();
        },
      },
      h("option", { value: "" }, "All types"),
      ...this.types.map((t) =>
        this.typeFilter === t
          ? h("option", { value: t, selected: "" }, optionLabel(t))
          : h("option", { value: t }, optionLabel(t)),
      ),
    );

    const feed = h("div", { class: "feed", id: "feed" });
    feed.addEventListener("scroll", () => {
      // A queued scroll event can fire after a re-render detached this
      // element; its geometry reads 0/0/0 then, which would auto-repin.
      if (!feed.isConnected) return;
      this.pinned = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 4;
      if (this.pinned && this.pendingNew > 0) {
        this.pendingNew = 0;
        this.render();
      }
    });
    if (this.earlier !== null) {
      const before = this.entries.length > 0 ? this.entries[0]!.sequence : null;
      feed.append(
        h(
          "button",
          { class: "load-more", onclick: () => void this.loadEarlier() },
          `Load earlier${before !== null && before > 0 ? ` · ${formatCount(before)} before this` : "…"}`,
        ),
      );
    }
    for (const entry of this.entries) {
      feed.append(this.entryEl(entry));
    }
    if (this.entries.length === 0 && this.earlier === null) {
      feed.append(
        this.typeFilter
          ? emptyState("filter", "No events of this type", "Other event types exist in this space.", {
              label: "Show all types",
              onClick: () => {
                this.typeFilter = null;
                void this.reload();
              },
            })
          : emptyState(
              "pulse",
              "No events yet",
              "The feed follows this space live — events appear the moment the owning app appends them.",
            ),
      );
    }

    const wrap = h("div", { class: "feed-wrap" }, feed);
    if (this.pendingNew > 0) {
      wrap.append(
        h(
          "button",
          {
            class: "new-pill",
            role: "status",
            onclick: () => {
              this.pendingNew = 0;
              this.pinned = true;
              this.render();
              this.scrollToBottom();
            },
          },
          `↓ ${formatCount(this.pendingNew)} new ${this.pendingNew === 1 ? "event" : "events"}`,
        ),
      );
    }

    this.root.append(
      scopeBanner(scope, facts, this.backToNow()),
      h(
        "div",
        { class: "toolbar" },
        typePicker,
        h("button", { onclick: () => void this.verifyChain() }, "Verify chain"),
        this.verificationEl(),
      ),
      wrap,
    );
  }

  private entryEl(entry: FeedEntry): HTMLElement {
    const open = this.expanded.has(entry.sequence);
    const container = h(
      "div",
      {
        class: `event-entry${this.freshSeqs.has(entry.sequence) ? " arrived" : ""}`,
        "data-seq": String(entry.sequence),
      },
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
        h("span", { class: "event-time", title: exactMicros(entry.timestamp) }, formatMicros(entry.timestamp)),
      ),
    );
    if (open) {
      container.append(
        h(
          "div",
          { class: "event-body" },
          jsonTree(entry.payload, "$", (p) => void navigator.clipboard.writeText(p)),
          h("div", { class: "event-hashes" }, `hash ${entry.hash.slice(0, 16)}… ← prev ${entry.previousHash.slice(0, 16)}…`),
        ),
      );
    }
    return container;
  }

  /** EV-3: the chain result is a chip; a broken chain jumps to the break. */
  private verificationEl(): HTMLElement {
    const v = this.verification;
    if (!v) return h("span", {});
    if (v.valid) {
      return h(
        "span",
        { class: "chip chain-ok-chip" },
        h("span", { class: "codicon codicon-verified", "aria-hidden": "true" }),
        `Chain intact · ${formatCount(v.length)} events`,
      );
    }
    const seq = v.firstInvalid;
    const loaded = seq !== null && this.entries.some((entry) => entry.sequence === seq);
    const label = `Chain broken at #${seq ?? "?"}`;
    if (!loaded || seq === null) {
      return h(
        "span",
        { class: "chip chain-bad-chip", title: v.error ?? "" },
        h("span", { class: "codicon codicon-error", "aria-hidden": "true" }),
        label,
      );
    }
    return h(
      "button",
      { class: "chip chain-bad-chip", title: v.error ?? "jump to the break", onclick: () => this.jumpTo(seq) },
      h("span", { class: "codicon codicon-error", "aria-hidden": "true" }),
      `${label} — jump to it`,
    );
  }

  private jumpTo(seq: number): void {
    this.expanded.add(seq);
    this.render();
    const target = this.root.querySelector(`[data-seq="${seq}"]`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.classList.add("attention");
      setTimeout(() => target.classList.remove("attention"), 1200);
    }
  }

  private scrollToBottom(): void {
    const feed = this.root.querySelector("#feed");
    if (feed) feed.scrollTop = feed.scrollHeight;
    this.pinned = true;
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, this.backToNow()),
      requestFailed(error, {
        what: "Couldn't load events",
        onRetry: () => void this.reload(),
        onBackToNow: this.backToNow(),
        onOpenDocs: (code) => void this.rpc.request({ op: "open-docs", code }),
      }),
    );
  }
}
