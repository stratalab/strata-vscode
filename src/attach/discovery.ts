/**
 * Database discovery (AR-3.4): classify directories by their on-disk layout
 * and find candidate databases under workspace roots. The V1 marker is
 * `manifest/current`; the pre-V1 marker files are `strata.toml`/`MANIFEST`
 * (upstream: storage layout PRE_V1_LAYOUT_MARKER_FILES).
 *
 * Cache-mode databases leave nothing durable on disk by design, so they can
 * never be discovered or attached — a configured path that is not a database
 * reports as such (F1.6's cache-mode/teaching state).
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type LayoutKind = "v1" | "pre-v1" | "not-a-database";

const PRE_V1_MARKERS = ["strata.toml", "MANIFEST"];
const SCAN_SKIP = new Set([
  "node_modules",
  ".git",
  ".hg",
  "target",
  "dist",
  "out",
  ".venv",
  "venv",
  "__pycache__",
]);
const SCAN_MAX_DEPTH = 5;

export function classifyLayout(dbPath: string): LayoutKind {
  // V1 marker: a manifest/ directory holding the current pointer. The local
  // object store suffixes object names (`current.object`), so match by
  // prefix rather than exact name.
  try {
    const manifest = path.join(dbPath, "manifest");
    if (fs.statSync(manifest).isDirectory()) {
      const entries = fs.readdirSync(manifest);
      if (entries.some((name) => name === "current" || name.startsWith("current."))) return "v1";
    }
  } catch {
    // no manifest directory
  }
  for (const marker of PRE_V1_MARKERS) {
    // isFile() matters: on case-insensitive filesystems "MANIFEST" would
    // otherwise match the V1 "manifest" DIRECTORY and misclassify.
    try {
      if (fs.statSync(path.join(dbPath, marker)).isFile()) return "pre-v1";
    } catch {
      // marker absent
    }
  }
  return "not-a-database";
}

/**
 * Bounded workspace scan (AR-7.1: cheap, never exhaustive): walks each root
 * to a small depth, skipping dependency/build directories, collecting
 * directories that look like Strata databases (V1 or pre-V1 — pre-V1 is
 * reported as a teaching state, not hidden).
 */
export function findDatabases(roots: string[], explicit: string[]): string[] {
  const found = new Set<string>();
  for (const explicitPath of explicit) {
    found.add(path.resolve(explicitPath));
  }
  for (const root of roots) {
    walk(root, 0, found);
  }
  return [...found].sort();
}

function walk(dir: string, depth: number, found: Set<string>): void {
  if (depth > SCAN_MAX_DEPTH) return;
  if (classifyLayout(dir) !== "not-a-database") {
    found.add(path.resolve(dir));
    return; // databases do not nest
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || SCAN_SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    walk(path.join(dir, entry.name), depth + 1, found);
  }
}
