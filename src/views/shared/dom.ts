/** Tiny DOM builder for the framework-free views (E8/N8). */
import { exactMicros, formatBytes, formatCount, formatMicros } from "./format";

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | ((event: Event) => void)> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === "function") {
      el.addEventListener(name.replace(/^on/, ""), value);
    } else if (name === "class") {
      el.className = value;
    } else {
      el.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Humanized timestamp with the exact microsecond form on hover (XC-4). */
export function timeEl(micros: number | null): HTMLElement {
  if (micros === null) return h("span", {}, "—");
  return h("span", { class: "time", title: exactMicros(micros) }, formatMicros(micros));
}

/** Humanized size with the exact byte count on hover (XC-5). */
export function byteEl(n: number): HTMLElement {
  return h("span", { class: "bytes", title: `${formatCount(n)} bytes` }, formatBytes(n));
}


/** Scrollable regions whose position must survive a re-render (XC-6). */
const SCROLL_REGIONS = [".table-scroll", ".feed", ".doc-list", ".doc-detail", ".sidebar", ".canvas-scroll"];

export function preservingScroll(root: HTMLElement, render: () => void): void {
  const saved: Array<[string, number]> = [];
  for (const selector of SCROLL_REGIONS) {
    const el = root.querySelector(selector);
    if (el && el.scrollTop > 0) saved.push([selector, el.scrollTop]);
  }
  // The filter input re-renders on every keystroke; without this, typing
  // loses focus after the first character (XC-6's re-render family).
  const active = document.activeElement;
  const activeFilter =
    active instanceof HTMLInputElement && active.classList.contains("filter")
      ? { start: active.selectionStart, end: active.selectionEnd }
      : null;
  render();
  for (const [selector, top] of saved) {
    const el = root.querySelector(selector);
    if (el) el.scrollTop = top;
  }
  if (activeFilter) {
    const el = root.querySelector(".filter");
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.setSelectionRange(activeFilter.start, activeFilter.end);
    }
  }
}

/** Transient confirmation at the click site (XC-9); announced to AT. */
export function flashCopied(target: HTMLElement): void {
  if (target.nextElementSibling?.classList.contains("copied-badge")) {
    target.nextElementSibling.remove();
  }
  const badge = h("span", { class: "copied-badge", role: "status" }, "Copied");
  target.after(badge);
  setTimeout(() => badge.remove(), 900);
}
