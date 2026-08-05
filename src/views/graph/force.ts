/**
 * Deterministic force-directed layout (F4.5): springs on edges, pairwise
 * repulsion, fixed iteration count, positions seeded from a hash of the node
 * id — no randomness, so layouts are reproducible and testable. Sized for
 * neighborhood-expansion graphs (tens to a few hundred nodes), not
 * whole-graph pulls, which the data layer makes impossible anyway.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdge {
  src: string;
  dst: string;
}

const ITERATIONS = 120;
const REPULSION = 6_000;
const SPRING = 0.02;
const SPRING_LENGTH = 90;
const DAMPING = 0.85;
const CENTER_PULL = 0.005;

/** Stable [0,1) from a string — the deterministic position seed. */
export function hash01(text: string, salt = 0): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function seedPosition(id: string, width: number, height: number): { x: number; y: number } {
  const angle = hash01(id) * Math.PI * 2;
  const radius = 0.25 + hash01(id, 7) * 0.2;
  return {
    x: width / 2 + Math.cos(angle) * radius * width,
    y: height / 2 + Math.sin(angle) * radius * height,
  };
}

/**
 * Lays out nodes in place. Nodes keep existing positions (incremental
 * expansion doesn't reshuffle the world); new nodes must arrive pre-seeded.
 */
export function runLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  width: number,
  height: number,
  iterations = ITERATIONS,
): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const vx = new Map<string, number>();
  const vy = new Map<string, number>();
  for (const node of nodes) {
    vx.set(node.id, 0);
    vy.set(node.id, 0);
  }

  for (let step = 0; step < iterations; step++) {
    // Pairwise repulsion.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) {
          // Coincident seeds: deterministic nudge from the pair's ids.
          dx = hash01(a.id + b.id) - 0.5;
          dy = hash01(b.id + a.id) - 0.5;
          dist2 = dx * dx + dy * dy;
        }
        const force = REPULSION / dist2;
        const dist = Math.sqrt(dist2);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        vx.set(a.id, vx.get(a.id)! + fx);
        vy.set(a.id, vy.get(a.id)! + fy);
        vx.set(b.id, vx.get(b.id)! - fx);
        vy.set(b.id, vy.get(b.id)! - fy);
      }
    }
    // Springs along edges.
    for (const edge of edges) {
      const a = byId.get(edge.src);
      const b = byId.get(edge.dst);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const force = SPRING * (dist - SPRING_LENGTH);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      vx.set(a.id, vx.get(a.id)! + fx);
      vy.set(a.id, vy.get(a.id)! + fy);
      vx.set(b.id, vx.get(b.id)! - fx);
      vy.set(b.id, vy.get(b.id)! - fy);
    }
    // Integrate with damping and a soft center pull.
    for (const node of nodes) {
      const pullX = (width / 2 - node.x) * CENTER_PULL;
      const pullY = (height / 2 - node.y) * CENTER_PULL;
      const nvx = (vx.get(node.id)! + pullX) * DAMPING;
      const nvy = (vy.get(node.id)! + pullY) * DAMPING;
      node.x = Math.min(width - 20, Math.max(20, node.x + nvx * 0.01));
      node.y = Math.min(height - 20, Math.max(20, node.y + nvy * 0.01));
      vx.set(node.id, nvx);
      vy.set(node.id, nvy);
    }
  }
}
