/**
 * Graph canvas (F4.5, craft per U9): an SVG node-link view built by
 * neighborhood expansion — seed from a sample, then grow adjacency with
 * bounded fan-out.
 *
 * Interaction contract (GR-4): click selects, Enter or double-click
 * expands; unexpanded nodes wear a dashed ring; hovering a node lights its
 * incident edges and dims the rest. The camera is a viewBox transform —
 * cursor-anchored wheel zoom, drag pan, and Fit (GR-2). Node colors come
 * from the theme's own chart hues assigned in ontology order (GR-1), edges
 * carry direction (GR-5), and analytics overlays explain themselves with
 * legends (GR-6). Honors reduced motion (layout is synchronous — no
 * animation to disable, N10).
 */
import { clear, h, preservingScroll } from "./shared/dom";
import { formatCount } from "./shared/format";
import { emptyState, loadingState, requestFailed } from "./shared/states";
import { scopeBanner } from "./shared/banner";
import { jsonTree } from "./shared/jsonTree";
import type { ViewRpc } from "./shared/rpc";
import type {
  GraphAnalyticsData,
  GraphExpandData,
  GraphNamesData,
  GraphNodeDetailData,
  GraphOntologyData,
} from "./shared/messages";
import { runLayout, seedPosition, type LayoutNode } from "./graph/force";

const WIDTH = 1200;
const HEIGHT = 800;
const EXPAND_LIMIT = 25;
const SVG_NS = "http://www.w3.org/2000/svg";

/** The theme's six categorical hues; overflow mixes adjacent pairs (GR-1). */
const CHART_HUES = ["blue", "green", "orange", "purple", "red", "yellow"];
function paletteColor(index: number): string {
  const a = CHART_HUES[index % 6]!;
  if (index < 6) return `var(--vscode-charts-${a}, #888888)`;
  const b = CHART_HUES[(index + 1) % 6]!;
  return `color-mix(in srgb, var(--vscode-charts-${a}, #888888) 55%, var(--vscode-charts-${b}, #888888))`;
}

interface CanvasNode extends LayoutNode {
  nodeType: string | null;
  expanded: boolean;
}

interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GraphCanvasView {
  private graphs: string[] = [];
  private active: string | null = null;
  private ontology: GraphOntologyData | null = null;
  private nodes = new Map<string, CanvasNode>();
  private edges: Array<{ src: string; dst: string; edgeType: string }> = [];
  private hiddenTypes = new Set<string>();
  private selected: GraphNodeDetailData | null = null;
  private overlay: GraphAnalyticsData | null = null;
  private truncationNote: string | null = null;
  /** First-seen color assignment, seeded from the ontology's order. */
  private typeOrder = new Map<string, number>();
  private camera: Camera | null = null;
  private svg: SVGSVGElement | null = null;
  private zoomReadout: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
  ) {
    rpc.onScopeChange(() => void this.reload());
  }

  async reload(): Promise<void> {
    if (!this.root.hasChildNodes()) this.renderLoading();
    try {
      const data = await this.rpc.request<GraphNamesData>({ op: "graph-names" });
      this.graphs = data.names;
      if (this.active && !this.graphs.includes(this.active)) this.active = null;
      if (!this.active && this.graphs.length === 1) {
        await this.openGraph(this.graphs[0]!);
        return;
      }
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  private async openGraph(name: string): Promise<void> {
    this.active = name;
    this.nodes.clear();
    this.edges = [];
    this.selected = null;
    this.overlay = null;
    this.truncationNote = null;
    this.typeOrder.clear();
    this.camera = null;
    const [ontology, seed] = await Promise.all([
      this.rpc.request<GraphOntologyData>({ op: "graph-ontology", graph: name }).catch(() => null),
      this.rpc.request<GraphExpandData>({ op: "graph-seed", graph: name, count: 10 }),
    ]);
    this.ontology = ontology;
    for (const t of ontology?.objectTypes ?? []) this.colorFor(t.name);
    this.merge(seed);
    this.layoutAndRender();
  }

  private colorFor(nodeType: string | null): string {
    if (!nodeType) return "var(--vscode-charts-lines, #888888)";
    if (!this.typeOrder.has(nodeType)) this.typeOrder.set(nodeType, this.typeOrder.size);
    return paletteColor(this.typeOrder.get(nodeType)!);
  }

  private async expand(nodeId: string): Promise<void> {
    if (!this.active) return;
    const node = this.nodes.get(nodeId);
    if (node) node.expanded = true;
    const data = await this.rpc.request<GraphExpandData>({
      op: "graph-neighbors",
      graph: this.active,
      nodeId,
      limit: EXPAND_LIMIT,
    });
    this.merge(data);
    if (data.truncated) {
      this.truncationNote = `Expansion of ${nodeId} capped at ${EXPAND_LIMIT} neighbors`;
    }
    this.layoutAndRender();
  }

  private async select(nodeId: string): Promise<void> {
    if (!this.active) return;
    this.selected = await this.rpc.request<GraphNodeDetailData>({
      op: "graph-node",
      graph: this.active,
      nodeId,
    });
    this.render();
  }

  private async runOverlay(algorithm: "pagerank" | "wcc"): Promise<void> {
    if (!this.active) return;
    const result = await this.rpc.request<GraphAnalyticsData>({
      op: "graph-analytics",
      graph: this.active,
      algorithm,
    });
    if (!result.cancelled) {
      this.overlay = result;
      this.render();
    }
  }

  private merge(data: GraphExpandData): void {
    for (const node of data.nodes) {
      if (!this.nodes.has(node.id)) {
        const seed = seedPosition(node.id, WIDTH, HEIGHT);
        this.nodes.set(node.id, { id: node.id, nodeType: node.nodeType, expanded: false, ...seed });
      }
    }
    const known = new Set(this.edges.map((e) => `${e.src}→${e.dst}:${e.edgeType}`));
    for (const edge of data.edges) {
      const key = `${edge.src}→${edge.dst}:${edge.edgeType}`;
      if (!known.has(key)) {
        known.add(key);
        this.edges.push(edge);
      }
    }
  }

  private layoutAndRender(): void {
    runLayout([...this.nodes.values()], this.edges, WIDTH, HEIGHT);
    if (this.camera === null) this.camera = this.fitCamera();
    this.render();
  }

  /** The camera that frames every visible node with padding (GR-2 Fit). */
  private fitCamera(): Camera {
    const visible = [...this.nodes.values()];
    if (visible.length === 0) return { x: 0, y: 0, w: WIDTH, h: HEIGHT };
    const xs = visible.map((n) => n.x);
    const ys = visible.map((n) => n.y);
    const pad = 60;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    const w = Math.max(120, Math.max(...xs) + pad - x);
    const hgt = Math.max(80, Math.max(...ys) + pad - y);
    return { x, y, w, h: hgt };
  }

  private applyCamera(): void {
    if (!this.svg || !this.camera) return;
    const c = this.camera;
    this.svg.setAttribute("viewBox", `${c.x} ${c.y} ${c.w} ${c.h}`);
    if (this.zoomReadout) {
      this.zoomReadout.textContent = `${Math.round((WIDTH / c.w) * 100)}%`;
    }
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
    if (this.graphs.length === 0) {
      this.root.append(
        scopeBanner(scope, null, this.backToNow()),
        emptyState(
          "type-hierarchy",
          "No graphs yet",
          "Graphs created by the owning app appear here the moment they land — this view follows the database live.",
        ),
      );
      return;
    }
    const facts = this.active
      ? `${formatCount(this.nodes.size)} nodes · ${formatCount(this.edges.length)} edges shown`
      : `${formatCount(this.graphs.length)} graphs`;
    this.root.append(
      scopeBanner(scope, facts, this.backToNow()),
      this.toolbarEl(),
      this.truncationNote !== null ? this.truncationEl() : h("div", {}),
      h("div", { class: "graph-split" }, this.canvasEl(), this.sidebarEl()),
    );
    this.applyCamera();
  }

  /** GR-7: truncation as a dismissible info chip — no silent caps (F4.6). */
  private truncationEl(): HTMLElement {
    return h(
      "div",
      { class: "truncation" },
      h("span", { class: "codicon codicon-info", "aria-hidden": "true" }),
      `${this.truncationNote} — narrower filters reach the rest`,
      h(
        "button",
        {
          class: "truncation-dismiss",
          "aria-label": "Dismiss",
          onclick: () => {
            this.truncationNote = null;
            this.render();
          },
        },
        "×",
      ),
    );
  }

  private toolbarEl(): HTMLElement {
    const picker = h(
      "select",
      {
        "aria-label": "Select graph",
        onchange: (e) => {
          const value = (e.target as HTMLSelectElement).value;
          if (value) void this.openGraph(value);
        },
      },
      h("option", { value: "" }, "Select graph…"),
      ...this.graphs.map((name) =>
        name === this.active
          ? h("option", { value: name, selected: "" }, name)
          : h("option", { value: name }, name),
      ),
    );
    this.zoomReadout = h("span", { class: "zoom-readout", "aria-label": "zoom level" }, "100%");
    return h(
      "div",
      { class: "toolbar" },
      picker,
      h(
        "button",
        {
          title: "Frame every node",
          onclick: () => {
            this.camera = this.fitCamera();
            this.applyCamera();
          },
        },
        "Fit",
      ),
      this.zoomReadout,
      h("button", { onclick: () => void this.runOverlay("pagerank") }, "Pagerank overlay"),
      h("button", { onclick: () => void this.runOverlay("wcc") }, "Components overlay"),
      this.overlay
        ? h(
            "button",
            { onclick: () => { this.overlay = null; this.render(); } },
            `Clear ${this.overlay.algorithm === "wcc" ? "components" : this.overlay.algorithm}`,
          )
        : h("span", {}),
    );
  }

  private canvasEl(): HTMLElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    this.svg = svg;
    svg.setAttribute("class", "graph-canvas");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "graph neighborhood canvas — click selects, Enter or double-click expands");

    // GR-5: direction is visible; the marker inherits the edge color.
    const defs = document.createElementNS(SVG_NS, "defs");
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "st-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const tip = document.createElementNS(SVG_NS, "path");
    tip.setAttribute("d", "M0 0 L10 5 L0 10 z");
    tip.setAttribute("class", "graph-arrow");
    marker.append(tip);
    defs.append(marker);
    svg.append(defs);

    const visible = new Set(
      [...this.nodes.values()]
        .filter((n) => n.nodeType === null || !this.hiddenTypes.has(n.nodeType))
        .map((n) => n.id),
    );

    const maxScore = this.overlay
      ? Math.max(1e-9, ...Object.values(this.overlay.scores))
      : null;
    const radiusOf = (node: CanvasNode): number => {
      let radius = node.expanded ? 10 : 8;
      if (this.overlay && this.overlay.algorithm === "pagerank" && maxScore !== null) {
        const score = this.overlay.scores[node.id];
        if (score !== undefined) radius = 6 + 14 * (score / maxScore);
      }
      return radius;
    };

    const edgeEls: Array<{ el: SVGLineElement; src: string; dst: string }> = [];
    for (const edge of this.edges) {
      if (!visible.has(edge.src) || !visible.has(edge.dst)) continue;
      const a = this.nodes.get(edge.src);
      const b = this.nodes.get(edge.dst);
      if (!a || !b) continue;
      // Shorten to the node rims so the arrow tip lands on the circle edge.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ra = radiusOf(a) + 1;
      const rb = radiusOf(b) + 3;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(a.x + (dx / len) * ra));
      line.setAttribute("y1", String(a.y + (dy / len) * ra));
      line.setAttribute("x2", String(b.x - (dx / len) * rb));
      line.setAttribute("y2", String(b.y - (dy / len) * rb));
      line.setAttribute("class", "graph-edge");
      line.setAttribute("marker-end", "url(#st-arrow)");
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${edge.src} —${edge.edgeType}→ ${edge.dst}`;
      line.append(title);
      svg.append(line);
      edgeEls.push({ el: line, src: edge.src, dst: edge.dst });
    }

    const groups = new Map<string, SVGGElement>();
    for (const node of this.nodes.values()) {
      if (!visible.has(node.id)) continue;
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("tabindex", "0");
      group.setAttribute("class", `graph-node${this.selected?.id === node.id ? " picked" : ""}`);
      group.setAttribute(
        "aria-label",
        `${node.id}${node.nodeType ? ` (${node.nodeType})` : ""} — Enter expands`,
      );
      const radius = radiusOf(node);
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(node.x));
      circle.setAttribute("cy", String(node.y));
      circle.setAttribute("r", String(radius));
      let fill = this.colorFor(node.nodeType);
      if (this.overlay && this.overlay.algorithm === "wcc") {
        const component = this.overlay.scores[node.id];
        if (component !== undefined) fill = paletteColor(Math.round(component));
      }
      circle.style.fill = fill;
      group.append(circle);
      // GR-4: expandability is visible — a dashed halo until expanded.
      if (!node.expanded) {
        const ring = document.createElementNS(SVG_NS, "circle");
        ring.setAttribute("cx", String(node.x));
        ring.setAttribute("cy", String(node.y));
        ring.setAttribute("r", String(radius + 3.5));
        ring.setAttribute("class", "expand-ring");
        group.append(ring);
      }
      // Click selects; Enter / double-click expands (GR-4).
      group.addEventListener("click", () => void this.select(node.id));
      group.addEventListener("dblclick", () => {
        if (!node.expanded) void this.expand(node.id);
      });
      group.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") {
          void this.select(node.id);
          if (!node.expanded) void this.expand(node.id);
        }
      });
      // Hover: light the incident edges, dim the rest.
      group.addEventListener("mouseenter", () => {
        const adjacent = new Set<string>([node.id]);
        for (const { el, src, dst } of edgeEls) {
          if (src === node.id || dst === node.id) {
            el.classList.add("lit");
            adjacent.add(src);
            adjacent.add(dst);
          } else {
            el.classList.add("dim");
          }
        }
        for (const [id, g] of groups) {
          if (!adjacent.has(id)) g.classList.add("dim");
        }
      });
      group.addEventListener("mouseleave", () => {
        for (const { el } of edgeEls) el.classList.remove("lit", "dim");
        for (const [, g] of groups) g.classList.remove("dim");
      });
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(node.x + radius + 4));
      label.setAttribute("y", String(node.y + 4));
      label.setAttribute("class", "graph-label");
      label.textContent = node.id.length > 24 ? `${node.id.slice(0, 24)}…` : node.id;
      group.append(label);
      svg.append(group);
      groups.set(node.id, group);
    }

    // GR-2: the camera. Wheel zooms about the cursor; dragging the
    // background pans; Fit reframes. viewBox only — never a re-layout.
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (!this.camera) return;
        const c = this.camera;
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const next = Math.min(WIDTH * 4, Math.max(WIDTH / 10, c.w * factor));
        const applied = next / c.w;
        const rect = svg.getBoundingClientRect();
        const px = c.x + ((e.clientX - rect.left) / rect.width) * c.w;
        const py = c.y + ((e.clientY - rect.top) / rect.height) * c.h;
        c.w *= applied;
        c.h *= applied;
        c.x = px - (px - c.x) * applied;
        c.y = py - (py - c.y) * applied;
        this.applyCamera();
      },
      { passive: false },
    );
    let panning: { x: number; y: number } | null = null;
    svg.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest(".graph-node")) return;
      panning = { x: e.clientX, y: e.clientY };
      svg.classList.add("panning");
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!panning || !this.camera) return;
      const rect = svg.getBoundingClientRect();
      this.camera.x -= ((e.clientX - panning.x) / rect.width) * this.camera.w;
      this.camera.y -= ((e.clientY - panning.y) / rect.height) * this.camera.h;
      panning = { x: e.clientX, y: e.clientY };
      this.applyCamera();
    });
    const endPan = () => {
      panning = null;
      svg.classList.remove("panning");
    };
    svg.addEventListener("pointerup", endPan);
    svg.addEventListener("pointercancel", endPan);

    return h("div", { class: "canvas-scroll" }, svg as unknown as HTMLElement);
  }

  private sidebarEl(): HTMLElement {
    const sidebar = h("div", { class: "sidebar" });
    if (this.ontology) {
      sidebar.append(
        h(
          "div",
          { class: "sidebar-title", title: `ontology ${this.ontology.status}` },
          "Ontology",
        ),
      );
      for (const t of this.ontology.objectTypes) {
        const hidden = this.hiddenTypes.has(t.name);
        const swatch = h("span", { class: "swatch" }, "");
        swatch.style.background = this.colorFor(t.name);
        sidebar.append(
          h(
            "button",
            {
              class: `type-chip${hidden ? " hidden-type" : ""}`,
              onclick: () => {
                if (hidden) this.hiddenTypes.delete(t.name);
                else this.hiddenTypes.add(t.name);
                this.render();
              },
            },
            swatch,
            `${t.name}${t.count !== null ? ` (${formatCount(t.count)})` : ""}${hidden ? " — hidden" : ""}`,
          ),
        );
      }
      if (this.ontology.linkTypes.length > 0) {
        sidebar.append(h("div", { class: "sidebar-sub" }, "Link types"));
        for (const t of this.ontology.linkTypes) {
          sidebar.append(
            h("div", { class: "link-type" }, `${t.name}${t.count !== null ? ` (${formatCount(t.count)})` : ""}`),
          );
        }
      }
    }
    this.appendOverlayLegend(sidebar);
    if (this.selected) {
      sidebar.append(
        h("div", { class: "sidebar-title" }, "Selection"),
        h("div", { class: "selection-id" }, this.selected.id),
        this.selected.found
          ? jsonTree(
              { type: this.selected.nodeType, properties: this.selected.properties, bindings: this.selected.bindings },
              "$",
              (p) => void navigator.clipboard.writeText(p),
            )
          : h("div", {}, "Not found"),
      );
    }
    return sidebar;
  }

  /** GR-6: overlays explain their encoding. */
  private appendOverlayLegend(sidebar: HTMLElement): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const scores = Object.values(overlay.scores);
    if (overlay.algorithm === "pagerank") {
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      sidebar.append(
        h("div", { class: "sidebar-title" }, "Pagerank"),
        h(
          "div",
          { class: "legend-row" },
          h("span", { class: "legend-dot legend-dot-min", "aria-hidden": "true" }),
          `min ${min.toFixed(3)}`,
        ),
        h(
          "div",
          { class: "legend-row" },
          h("span", { class: "legend-dot legend-dot-max", "aria-hidden": "true" }),
          `max ${max.toFixed(3)}`,
        ),
        h("div", { class: "legend-note" }, "Node size encodes rank"),
      );
      return;
    }
    const components = [...new Set(scores.map((s) => Math.round(s)))].sort((a, b) => a - b);
    sidebar.append(h("div", { class: "sidebar-title" }, "Components"));
    sidebar.append(
      h(
        "div",
        { class: "legend-note" },
        `${formatCount(components.length)} connected ${components.length === 1 ? "component" : "components"}`,
      ),
    );
    for (const component of components.slice(0, 6)) {
      const count = scores.filter((s) => Math.round(s) === component).length;
      const swatch = h("span", { class: "swatch" }, "");
      swatch.style.background = paletteColor(component);
      sidebar.append(
        h("div", { class: "legend-row" }, swatch, `component ${component + 1} · ${formatCount(count)} nodes`),
      );
    }
    if (components.length > 6) {
      sidebar.append(h("div", { class: "legend-note" }, `…and ${formatCount(components.length - 6)} more`));
    }
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, this.backToNow()),
      requestFailed(error, {
        what: "Couldn't load the graph",
        onRetry: () => void this.reload(),
        onBackToNow: this.backToNow(),
        onOpenDocs: (code) => void this.rpc.request({ op: "open-docs", code }),
      }),
    );
  }
}
