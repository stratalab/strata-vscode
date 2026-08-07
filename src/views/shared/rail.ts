/**
 * The strata rail (SIG-1) — the product's signature rendering of history.
 * Every timeline (KV key, JSON document, vector entry) is the same sediment
 * column: newest layer on top, one 22px row per version, a "core sample"
 * glyph in a fixed left cell whose bands dim with depth. Tombstones are
 * hatched and struck through; the current scrub/compare position wears the
 * amber marker. The verb is explicit per view ("Scrub here" / "Compare with
 * current") and the whole rail is a keyboard-navigable listbox.
 */
import { h } from "./dom";
import { exactMicros, formatMicros } from "./format";

export interface RailEntry {
  version: number;
  timestamp: number;
  tombstone: boolean;
  preview: string | null;
}

export interface RailOptions {
  /** Eyebrow heading: "History". */
  title: string;
  /** What picking a layer does — shown on hover/focus and in aria labels. */
  verb: string;
  /** Marks the layer the view is currently positioned on, if any. */
  activeMicros: number | null;
  onPick: (entry: RailEntry) => void;
}

export function strataRail(entries: RailEntry[], options: RailOptions): HTMLElement {
  const rail = h(
    "div",
    { class: "rail", role: "listbox", "aria-label": `${options.title} — ${options.verb}` },
    h("div", { class: "rail-title", "aria-hidden": "true" }, options.title),
  );

  entries.forEach((entry, index) => {
    const active = options.activeMicros !== null && entry.timestamp === options.activeMicros;
    const core = h("span", { class: "rail-core", "aria-hidden": "true" });
    // Sediment depth: layers dim as they go down the column.
    core.style.opacity = String(Math.max(0.45, 1 - index * 0.12));

    rail.append(
      h(
        "button",
        {
          class: `rail-entry${entry.tombstone ? " tombstone" : ""}${active ? " active" : ""}`,
          role: "option",
          "aria-selected": String(active),
          "data-newest": String(index === 0),
          title: `${options.verb} — ${exactMicros(entry.timestamp)}`,
          onclick: () => options.onPick(entry),
        },
        core,
        h("span", { class: "rail-version" }, `v${entry.version}`),
        h("span", { class: "rail-time" }, formatMicros(entry.timestamp)),
        h(
          "span",
          { class: "rail-preview" },
          `${entry.tombstone ? "deleted" : ""}${entry.tombstone && entry.preview ? " · " : ""}${entry.preview ?? ""}`,
        ),
        h("span", { class: "rail-verb" }, active ? "current position" : options.verb),
      ),
    );
  });

  rail.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const options_ = [...rail.querySelectorAll<HTMLButtonElement>(".rail-entry")];
    const index = options_.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    options_[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  });

  return rail;
}
