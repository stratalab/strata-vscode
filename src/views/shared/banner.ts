/**
 * The scope banner every view carries (F4.6): branch, space, scrubber
 * position, and page facts — no view ever silently truncates.
 */
import { h } from "./dom";
import type { ViewScope } from "./messages";

export function scopeBanner(
  scope: ViewScope,
  pageFacts: string | null,
  onBackToNow: (() => void) | null,
): HTMLElement {
  const parts: Array<Node | string> = [
    h("span", { class: "banner-scope" }, `branch ${scope.branch} · space ${scope.space}`),
  ];
  if (scope.asOfLabel) {
    parts.push(
      h("span", { class: "banner-scrub" }, ` ⏪ as of ${scope.asOfLabel} — historical state; live refresh suspended`),
    );
    if (onBackToNow) {
      parts.push(
        h("button", { class: "banner-now", onclick: () => onBackToNow() }, "back to now"),
      );
    }
  }
  if (pageFacts) parts.push(h("span", { class: "banner-pages" }, ` · ${pageFacts}`));
  return h("div", { class: "scope-banner" }, ...parts);
}
