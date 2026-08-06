/**
 * The state triad (U4, XC-6/XC-7/XC-8): every view renders *something
 * designed* in all of its states. Loading is skeleton rows under the real
 * banner (never a blank page), empty is an invitation that says how the
 * screen fills, and failure is a card that states what failed, carries the
 * server's message verbatim, and offers the one action that helps.
 */
import { h } from "./dom";
import { scopeBanner } from "./banner";
import { ViewRpcError } from "./rpc";
import type { ViewScope } from "./messages";

/** Deterministic column widths, % — visual rhythm without randomness. */
const SKELETON_ROWS = [
  [18, 42, 8],
  [24, 30, 8],
  [14, 48, 8],
  [20, 36, 8],
  [16, 44, 8],
  [22, 28, 8],
];

/** First-paint state: the real banner (scope is known at init) + shimmer. */
export function loadingState(
  scope: ViewScope,
  onBackToNow: (() => void) | null,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(scopeBanner(scope, null, onBackToNow));
  const skeleton = h("div", { class: "skeleton", role: "status", "aria-label": "Loading" });
  for (const widths of SKELETON_ROWS) {
    const row = h("div", { class: "skeleton-row", "aria-hidden": "true" });
    for (const width of widths) {
      row.append(h("span", { class: "skeleton-block", style: `flex-basis:${width}%` }));
    }
    skeleton.append(row);
  }
  fragment.append(skeleton);
  return fragment;
}

export interface EmptyAction {
  label: string;
  onClick: () => void;
}

/** An empty screen is an invitation to act, never a shrug (XC-7). */
export function emptyState(
  icon: string,
  title: string,
  body: string,
  action: EmptyAction | null = null,
): HTMLElement {
  return h(
    "div",
    { class: "empty-state" },
    h("span", { class: `codicon codicon-${icon}`, "aria-hidden": "true" }),
    h("div", { class: "empty-title" }, title),
    h("div", { class: "empty-body" }, body),
    action ? h("button", { onclick: () => action.onClick() }, action.label) : null,
  );
}

export interface FailureContext {
  /** What failed, in the user's terms: "Couldn't load keys". */
  what: string;
  onRetry: () => void;
  /** Offered instead of Retry when the failure is a retention edge (F2.5). */
  onBackToNow: (() => void) | null;
  /** Routes to the host, which resolves the docs URL and opens it
   * externally — the webview bundle stays free of network strings (N8). */
  onOpenDocs: (code: string) => void;
}

/** The failure card (XC-8): cause, verbatim message, one helpful action. */
export function requestFailed(error: unknown, context: FailureContext): HTMLElement {
  const shape = error instanceof ViewRpcError ? error.shape : null;
  const retention = shape?.retention ?? false;
  const message = shape?.message ?? (error instanceof Error ? error.message : String(error));
  const code = shape?.code ?? null;
  const linkable = code !== null && code.includes(".");

  const title = retention ? "This version is no longer retained" : context.what;
  const icon = retention ? "history" : "error";
  const action =
    retention && context.onBackToNow
      ? h("button", { onclick: () => context.onBackToNow!() }, "Back to now")
      : h("button", { onclick: () => context.onRetry() }, "Retry");

  const codeEl =
    code === null
      ? null
      : linkable
        ? h(
            "button",
            {
              class: "error-code error-code-link",
              title: `Open the docs for ${code}`,
              onclick: () => context.onOpenDocs(code),
            },
            code,
          )
        : h("span", { class: "error-code" }, code);

  return h(
    "div",
    { class: `error-card${retention ? " retention-card" : ""}`, role: "alert" },
    h(
      "div",
      { class: "error-title" },
      h("span", { class: `codicon codicon-${icon}`, "aria-hidden": "true" }),
      title,
    ),
    h("div", { class: "error-message" }, message),
    h("div", { class: "error-actions" }, action, codeEl),
  );
}
