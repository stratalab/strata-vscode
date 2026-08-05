/**
 * Client-side structural JSON diff (F4.2): the set of JSONPaths added,
 * removed, or changed between two documents — the time-travel payoff made
 * visible. Pure and jsdom-free.
 */
import type { DiffMarks } from "./jsonTree";

export function structuralDiff(before: unknown, after: unknown, path = "$"): DiffMarks {
  const marks: DiffMarks = new Map();
  walk(before, after, path, marks);
  return marks;
}

function walk(before: unknown, after: unknown, path: string, marks: DiffMarks): void {
  if (deepEqual(before, after)) return;
  const beforeIsObj = isContainer(before);
  const afterIsObj = isContainer(after);
  if (!beforeIsObj || !afterIsObj || Array.isArray(before) !== Array.isArray(after)) {
    marks.set(path, before === undefined ? "added" : after === undefined ? "removed" : "changed");
    return;
  }
  const keys = new Set([
    ...containerKeys(before as object),
    ...containerKeys(after as object),
  ]);
  let touched = false;
  for (const key of keys) {
    const childPath = Array.isArray(before) ? `${path}[${key}]` : `${path}.${key}`;
    const b = (before as Record<string, unknown>)[key];
    const a = (after as Record<string, unknown>)[key];
    if (b === undefined && a !== undefined) {
      marks.set(childPath, "added");
      touched = true;
    } else if (b !== undefined && a === undefined) {
      marks.set(childPath, "removed");
      touched = true;
    } else if (!deepEqual(b, a)) {
      walk(b, a, childPath, marks);
      touched = true;
    }
  }
  if (touched) marks.set(path, "changed");
}

function isContainer(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function containerKeys(value: object): string[] {
  return Array.isArray(value) ? value.map((_, i) => String(i)) : Object.keys(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
