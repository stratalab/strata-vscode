/**
 * Collapsible JSON tree with copyable path breadcrumbs (F4.2). Paths render
 * as JSONPath ($.a.b[0]); diff marks colorize changed paths (F4.2 diff).
 */
import { flashCopied, h } from "./dom";

export type DiffMarks = Map<string, "added" | "removed" | "changed">;

export function jsonTree(
  value: unknown,
  path: string,
  onCopyPath: (path: string) => void,
  marks: DiffMarks | null = null,
  depth = 0,
): HTMLElement {
  const mark = marks?.get(path);
  const markClass = mark ? ` diff-${mark}` : "";

  if (value === null || typeof value !== "object") {
    const raw = JSON.stringify(value) ?? "undefined";
    const valueSpan = h("span", {
      class: `json-value json-${typeof value}`,
      title: "copy value",
      onclick: (e) => {
        void navigator.clipboard.writeText(raw);
        flashCopied(e.currentTarget as HTMLElement);
      },
    });
    const leaf = h(
      "div",
      { class: `json-leaf${markClass}` },
      h("span", { class: "json-path", onclick: (e) => { onCopyPath(path); flashCopied(e.currentTarget as HTMLElement); }, title: `copy ${path}` }, leafName(path)),
      valueSpan,
    );
    if (raw.length > 240) {
      valueSpan.textContent = `${raw.slice(0, 240)}…`;
      leaf.append(
        h(
          "button",
          {
            class: "show-all",
            onclick: (e) => {
              valueSpan.textContent = raw;
              (e.currentTarget as HTMLElement).remove();
            },
          },
          "show all",
        ),
      );
    } else {
      valueSpan.textContent = raw;
    }
    return leaf;
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [`[${i}]`, `${path}[${i}]`, v] as const)
    : Object.entries(value as Record<string, unknown>).map(
        ([k, v]) => [k, `${path}.${k}`, v] as const,
      );

  const details = h("details", depth < 2 ? { open: "" } : {}) as HTMLDetailsElement;
  details.className = `json-node${markClass}`;
  details.append(
    h(
      "summary",
      {},
      h("span", { class: "json-path", onclick: (e) => { e.stopPropagation(); onCopyPath(path); flashCopied(e.currentTarget as HTMLElement); }, title: `copy ${path}` }, leafName(path)),
      h("span", { class: "json-meta" }, Array.isArray(value) ? ` [${entries.length}]` : ` {${entries.length}}`),
    ),
  );
  for (const [, childPath, child] of entries) {
    details.append(jsonTree(child, childPath, onCopyPath, marks, depth + 1));
  }
  return details;
}

function leafName(path: string): string {
  const match = /(?:\.([^.[\]]+)|(\[\d+\]))$/.exec(path);
  return match ? (match[1] ?? match[2]!) : path;
}
