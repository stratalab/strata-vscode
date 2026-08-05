/** Tiny DOM builder for the framework-free views (E8/N8). */

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

export function microsToIso(micros: number): string {
  return new Date(Math.floor(micros / 1000)).toISOString();
}
