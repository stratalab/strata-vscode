/**
 * Graph canvas (F4.5): an SVG node-link view built by neighborhood
 * expansion — seed from a sample or type, expand adjacency on click with
 * bounded fan-out. Ontology sidebar colors and filters by type; analytics
 * overlays (pagerank, wcc) colorize the current canvas after the
 * expensive-command confirmation (host-side, F3.4). Honors reduced motion
 * (layout is synchronous anyway — no animation to disable, N10).
 */
import { clear, h } from "./shared/dom";
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
import { hash01, runLayout, seedPosition, type LayoutNode } from "./graph/force";

const WIDTH = 1200;
const HEIGHT = 800;
const EXPAND_LIMIT = 25;

interface CanvasNode extends LayoutNode {
  nodeType: string | null;
  expanded: boolean;
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

  constructor(
    private readonly root: HTMLElement,
    private readonly rpc: ViewRpc,
  ) {
    rpc.onScopeChange(() => void this.reload());
  }

  async reload(): Promise<void> {
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
    const [ontology, seed] = await Promise.all([
      this.rpc.request<GraphOntologyData>({ op: "graph-ontology", graph: name }).catch(() => null),
      this.rpc.request<GraphExpandData>({ op: "graph-seed", graph: name, count: 10 }),
    ]);
    this.ontology = ontology;
    this.merge(seed);
    this.layoutAndRender();
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
      this.truncationNote = `expansion of ${nodeId} hit the ${EXPAND_LIMIT}-neighbor bound — narrower filters reach the rest`;
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
    this.render();
  }

  render(): void {
    const scope = this.rpc.scope!;
    clear(this.root);
    const facts = this.active
      ? `${this.nodes.size} nodes · ${this.edges.length} edges shown (expand nodes to reveal more)`
      : `${this.graphs.length} graphs`;
    this.root.append(
      scopeBanner(scope, facts, scope.asOfLabel ? () => void this.rpc.request({ op: "scrub", micros: null }) : null),
      this.toolbarEl(),
      this.truncationNote ? h("div", { class: "truncation" }, this.truncationNote) : h("div", {}),
      h("div", { class: "graph-split" }, this.canvasEl(), this.sidebarEl()),
    );
  }

  private toolbarEl(): HTMLElement {
    const picker = h(
      "select",
      {
        onchange: (e) => {
          const value = (e.target as HTMLSelectElement).value;
          if (value) void this.openGraph(value);
        },
      },
      h("option", { value: "" }, "select graph…"),
      ...this.graphs.map((name) =>
        name === this.active
          ? h("option", { value: name, selected: "" }, name)
          : h("option", { value: name }, name),
      ),
    );
    return h(
      "div",
      { class: "toolbar" },
      picker,
      h("button", { onclick: () => void this.runOverlay("pagerank") }, "pagerank overlay"),
      h("button", { onclick: () => void this.runOverlay("wcc") }, "wcc overlay"),
      this.overlay
        ? h("button", { onclick: () => { this.overlay = null; this.render(); } }, `clear ${this.overlay.algorithm}`)
        : h("span", {}),
    );
  }

  private canvasEl(): HTMLElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute("class", "graph-canvas");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "graph neighborhood canvas");

    const visible = new Set(
      [...this.nodes.values()]
        .filter((n) => n.nodeType === null || !this.hiddenTypes.has(n.nodeType))
        .map((n) => n.id),
    );

    for (const edge of this.edges) {
      if (!visible.has(edge.src) || !visible.has(edge.dst)) continue;
      const a = this.nodes.get(edge.src);
      const b = this.nodes.get(edge.dst);
      if (!a || !b) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
      line.setAttribute("class", "graph-edge");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${edge.src} —${edge.edgeType}→ ${edge.dst}`;
      line.append(title);
      svg.append(line);
    }

    const maxScore = this.overlay
      ? Math.max(1e-9, ...Object.values(this.overlay.scores))
      : null;

    for (const node of this.nodes.values()) {
      if (!visible.has(node.id)) continue;
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("tabindex", "0");
      group.setAttribute("class", "graph-node");
      group.setAttribute("aria-label", `${node.id}${node.nodeType ? ` (${node.nodeType})` : ""}`);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(node.x));
      circle.setAttribute("cy", String(node.y));
      let radius = node.expanded ? 10 : 8;
      let fill = typeColor(node.nodeType);
      if (this.overlay && maxScore !== null) {
        const score = this.overlay.scores[node.id];
        if (score !== undefined) {
          if (this.overlay.algorithm === "pagerank") {
            radius = 6 + 14 * (score / maxScore);
          } else {
            fill = componentColor(score);
          }
        }
      }
      circle.setAttribute("r", String(radius));
      circle.setAttribute("fill", fill);
      const activate = () => {
        void this.select(node.id);
        if (!node.expanded) void this.expand(node.id);
      };
      group.addEventListener("click", activate);
      group.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") activate();
      });
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(node.x + 12));
      label.setAttribute("y", String(node.y + 4));
      label.setAttribute("class", "graph-label");
      label.textContent = node.id.length > 24 ? `${node.id.slice(0, 24)}…` : node.id;
      group.append(circle, label);
      svg.append(group);
    }

    return h("div", { class: "canvas-scroll" }, svg as unknown as HTMLElement);
  }

  private sidebarEl(): HTMLElement {
    const sidebar = h("div", { class: "sidebar" });
    if (this.ontology) {
      sidebar.append(h("div", { class: "sidebar-title" }, `ontology (${this.ontology.status})`));
      for (const t of this.ontology.objectTypes) {
        const hidden = this.hiddenTypes.has(t.name);
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
            h("span", { class: "swatch", style: `background:${typeColor(t.name)}` }, ""),
            `${t.name}${t.count !== null ? ` (${t.count})` : ""}${hidden ? " — hidden" : ""}`,
          ),
        );
      }
      if (this.ontology.linkTypes.length > 0) {
        sidebar.append(h("div", { class: "sidebar-sub" }, "link types"));
        for (const t of this.ontology.linkTypes) {
          sidebar.append(h("div", { class: "link-type" }, `${t.name}${t.count !== null ? ` (${t.count})` : ""}`));
        }
      }
    }
    if (this.selected) {
      sidebar.append(
        h("div", { class: "sidebar-title" }, `node ${this.selected.id}`),
        this.selected.found
          ? jsonTree(
              { type: this.selected.nodeType, properties: this.selected.properties, bindings: this.selected.bindings },
              "$",
              (p) => void navigator.clipboard.writeText(p),
            )
          : h("div", {}, "not found"),
      );
    }
    return sidebar;
  }

  private renderError(error: unknown): void {
    clear(this.root);
    this.root.append(
      scopeBanner(this.rpc.scope!, null, null),
      h("div", { class: "error" }, `error: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}

/** Stable type → hue mapping; never the only signal (labels carry type too, N10). */
function typeColor(nodeType: string | null): string {
  if (!nodeType) return "var(--vscode-charts-lines, #888)";
  return `hsl(${Math.floor(hash01(nodeType) * 360)} 55% 55%)`;
}

function componentColor(component: number): string {
  return `hsl(${(component * 67) % 360} 60% 50%)`;
}
