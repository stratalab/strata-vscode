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

