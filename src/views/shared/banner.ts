/**
 * The scope banner every view carries (F4.6, redesigned per BN-1): a
 * structured instrument bar — breadcrumbs (database ▸ branch ▸ space) as the
 * page's h1, a mode cell (live dot, or the amber-marked "as of" state with
 * Back to now), and page facts right-aligned. No view ever silently
 * truncates; the banner is where that honesty lives.
 */
import { h } from "./dom";
import type { ViewScope } from "./messages";
import { exactMicros } from "./format";

function crumb(label: string, value: string): HTMLElement {
  return h(
    "span",
    { class: "crumb" },
    h("span", { class: "crumb-label" }, label),
    h("span", { class: "crumb-value" }, value),
  );
}

export function scopeBanner(
  scope: ViewScope,
  pageFacts: string | null,
  onBackToNow: (() => void) | null,
): HTMLElement {
  const dbName = scope.dbPath.split("/").pop() ?? scope.dbPath;
  const crumbs = h(
    "h1",
    { class: "banner-crumbs" },
    h("span", { class: "crumb crumb-db", title: scope.dbPath }, dbName),
    crumb("branch", scope.branch),
    crumb("space", scope.space),
  );

  const mode = scope.asOfLabel
    ? h(
        "span",
        { class: "banner-mode" },
        h(
          "span",
          {
            class: "banner-scrub",
            ...(scope.asOfMicros !== null ? { title: exactMicros(scope.asOfMicros) } : {}),
          },
          h("span", { class: "codicon codicon-history", "aria-hidden": "true" }),
          `As of ${scope.asOfLabel} — historical state; live refresh suspended`,
        ),
        onBackToNow
          ? h("button", { class: "banner-now", onclick: () => onBackToNow() }, "Back to now")
          : null,
      )
    : h(
        "span",
        { class: "banner-mode banner-live" },
        h("span", { class: "live-dot", "aria-hidden": "true" }),
        "Live",
      );

  const header = h(
    "header",
    { class: "scope-banner", "data-mode": scope.asOfLabel ? "past" : "live" },
    crumbs,
    mode,
  );
  if (pageFacts) header.append(h("span", { class: "banner-pages" }, pageFacts));
  return header;
}
