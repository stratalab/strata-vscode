/**
 * The visual + a11y matrix (U1): every view × state × stock theme, rendered
 * from the real bundle against fixtures, screenshotted into
 * test-results/visual/ (CI uploads the folder as an artifact) and checked
 * with axe. Critical a11y violations fail; serious ones are attached to the
 * test report so the D1 epics can burn the list down deliberately.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildHarnessHtml, type HarnessMode } from "./harness";
import { THEMES, themeCss } from "./themes";
import { EMPTY, ERROR_ENVELOPE, LIVE_SCOPE, POPULATED, SCRUBBED_SCOPE, type StateName } from "./fixtures";
import type { ViewKind } from "../../src/views/shared/messages";

const BUNDLE_PATH = path.resolve(__dirname, "../../dist/views/main.js");
const OUT_DIR = path.resolve(__dirname, "../../test-results/visual");
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const CODICON_TTF = require.resolve("@vscode/codicons/dist/codicon.ttf");

/** The real page injects @font-face with a webview URI; the harness inlines
 * the same font as a data: URI so glyphs render identically. */
const FONT_FACE = `@font-face { font-family: "codicon"; font-display: block; src: url("data:font/ttf;base64,${fs
  .readFileSync(CODICON_TTF)
  .toString("base64")}") format("truetype"); }`;

const VIEWS: ViewKind[] = ["kv", "json", "events", "vectors", "graph"];
const STATES: StateName[] = ["populated", "empty", "loading", "error", "scrubbed"];

function stateSpec(state: StateName): { mode: HarnessMode; responses: Record<string, unknown>; scrubbed: boolean } {
  switch (state) {
    case "populated":
      return { mode: "fixtures", responses: POPULATED, scrubbed: false };
    case "empty":
      return { mode: "fixtures", responses: EMPTY, scrubbed: false };
    case "loading":
      return { mode: "silent", responses: {}, scrubbed: false };
    case "error":
      return { mode: "error", responses: { __error: ERROR_ENVELOPE }, scrubbed: false };
    case "scrubbed":
      return { mode: "fixtures", responses: POPULATED, scrubbed: true };
  }
}

/** Drive each populated view to its richest honest state before the shot. */
async function interact(page: Page, view: ViewKind, state: StateName): Promise<void> {
  if (state === "loading") {
    // First paint is the real banner over skeleton rows (XC-6).
    await expect(page.locator(".skeleton-row").first()).toBeVisible();
    await expect(page.locator(".scope-banner")).toBeVisible();
    return;
  }
  if (state === "error") {
    await expect(page.locator(".error-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    return;
  }
  if (state === "scrubbed") {
    await expect(page.locator(".banner-scrub")).toBeVisible();
  }
  if (state === "empty") {
    await expect(page.locator(".scope-banner")).toBeVisible();
    await expect(page.locator(".empty-state")).toBeVisible();
    return;
  }
  switch (view) {
    case "kv":
      await page.locator("tbody tr").first().click();
      await expect(page.locator(".detail")).toBeVisible();
      await expect(page.locator(".rail-entry").first()).toBeVisible();
      break;
    case "json":
      await page.locator(".doc-item").first().click();
      await expect(page.locator(".json-node").first()).toBeVisible();
      await expect(page.locator(".rail-entry").first()).toBeVisible();
      // Compare against an older layer — the diff chips render (JS-2).
      await page.locator(".rail-entry").nth(1).click();
      await expect(page.locator(".diff-note")).toBeVisible();
      break;
    case "events":
      await page.locator(".event-head").nth(1).click();
      await expect(page.locator(".event-hashes")).toBeVisible();
      await page.getByRole("button", { name: "Verify chain" }).click();
      await expect(page.locator(".chain-ok-chip")).toBeVisible();
      break;
    case "vectors":
      await page.locator(".card").first().click();
      await expect(page.locator(".vector-table")).toBeVisible();
      await page.getByRole("button", { name: "history" }).first().click();
      await expect(page.locator(".rail-entry").first()).toBeVisible();
      break;
    case "graph": {
      // A single graph auto-opens; click selects, double-click expands.
      // Click the circle (the group's left edge) — the label can extend
      // past the clipped canvas, putting the bbox center off-screen.
      const node = page.locator(".graph-node").first();
      const box = (await node.boundingBox())!;
      const circle = { position: { x: 12, y: box.height / 2 } };
      await node.click(circle);
      await expect(page.locator(".selection-id")).toBeVisible();
      await node.dblclick(circle);
      await expect(page.locator(".truncation")).toBeVisible();
      break;
    }
  }
}

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: unknown; summary?: string }>;
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: fs.readFileSync(AXE_PATH, "utf8") });
  return page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.map((v: AxeViolation) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n: { target: unknown; failureSummary?: string }) => ({ target: n.target, summary: n.failureSummary })),
    }));
  });
}

test.beforeAll(() => {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(`webview bundle missing at ${BUNDLE_PATH} — run \`npm run build\` first`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

for (const theme of THEMES) {
  for (const view of VIEWS) {
    for (const state of STATES) {
      test(`${view} · ${state} · ${theme.name}`, async ({ page }) => {
        const spec = stateSpec(state);
        const html = buildHarnessHtml({
          bundleJs: fs.readFileSync(BUNDLE_PATH, "utf8"),
          themeCss: FONT_FACE + themeCss(theme),
          bodyClass: theme.bodyClass,
          view,
          scope: spec.scrubbed ? SCRUBBED_SCOPE : LIVE_SCOPE,
          mode: spec.mode,
          responses: spec.responses,
        });
        await page.setContent(html, { waitUntil: "load" });
        await interact(page, view, state);
        await page.screenshot({
          path: path.join(OUT_DIR, `${view}--${state}--${theme.name}.png`),
          fullPage: true,
        });

        if (state === "loading") return; // blank page — nothing for axe to judge
        const violations = await runAxe(page);
        if (violations.length > 0) {
          // Into the artifact folder next to the screenshots, so the CI
          // upload carries the a11y ledger too.
          fs.writeFileSync(
            path.join(OUT_DIR, `axe--${view}--${state}--${theme.name}.json`),
            JSON.stringify(violations, null, 2),
          );
        }
        const critical = violations.filter((v) => v.impact === "critical");
        expect(critical, `critical a11y violations: ${critical.map((v) => v.id).join(", ")}`).toEqual([]);
      });
    }
  }
}

test("feed follow mode: arrivals never steal the viewport (EV-1/SIG-3)", async ({ page }) => {
  // Short viewport so the feed overflows on every platform's font
  // metrics — unpinning must be real, or the auto-repin path re-renders
  // and legitimately removes the pill.
  await page.setViewportSize({ width: 800, height: 220 });
  const html = buildHarnessHtml({
    bundleJs: fs.readFileSync(BUNDLE_PATH, "utf8"),
    themeCss: FONT_FACE + themeCss(THEMES[0]!),
    bodyClass: THEMES[0]!.bodyClass,
    view: "events",
    scope: LIVE_SCOPE,
    mode: "fixtures",
    responses: POPULATED,
  });
  await page.setContent(html, { waitUntil: "load" });
  await expect(page.locator(".event-entry").first()).toBeVisible();

  // Read upstream: unpin from the bottom.
  await page.locator("#feed").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });

  // A new event lands and a tick fires.
  await page.evaluate(() => {
    interface Fix {
      responses: { "event-head": { items: Array<Record<string, unknown>>; total: number } };
      scope: unknown;
    }
    const fix = (window as unknown as { __fix: Fix }).__fix;
    const head = fix.responses["event-head"];
    head.items = [
      ...head.items,
      {
        sequence: 14,
        version: 15,
        timestamp: 1786000000000000,
        eventType: "agent.step",
        payload: { thought: "fresh arrival" },
        hash: "e9".repeat(32),
        previousHash: "d8".repeat(32),
      },
    ];
    head.total = 15;
    window.postMessage({ kind: "refresh", scope: fix.scope }, "*");
  });

  // The pill appears, the fresh entry wears the fade, and the viewport
  // stays where the reader left it.
  await expect(page.locator(".new-pill")).toHaveText(/1 new event/);
  await expect(page.locator(".event-entry.arrived")).toHaveCount(1);
  expect(await page.locator("#feed").evaluate((el) => el.scrollTop)).toBeLessThan(60);

  // The pill jumps and re-pins.
  await page.locator(".new-pill").click();
  await expect(page.locator(".new-pill")).toHaveCount(0);
  expect(
    await page.locator("#feed").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4),
  ).toBe(true);
});

test("graph camera: cursor-anchored zoom, drag pan, fit (GR-2)", async ({ page }) => {
  const html = buildHarnessHtml({
    bundleJs: fs.readFileSync(BUNDLE_PATH, "utf8"),
    themeCss: FONT_FACE + themeCss(THEMES[0]!),
    bodyClass: THEMES[0]!.bodyClass,
    view: "graph",
    scope: LIVE_SCOPE,
    mode: "fixtures",
    responses: POPULATED,
  });
  await page.setContent(html, { waitUntil: "load" });
  await expect(page.locator(".graph-node").first()).toBeVisible();
  const viewBox = () => page.locator(".graph-canvas").getAttribute("viewBox");
  const width = async () => Number((await viewBox())!.split(" ")[2]);

  const fitted = await width();
  await page.locator(".graph-canvas").hover();
  await page.mouse.wheel(0, -240); // zoom in
  await expect.poll(width).toBeLessThan(fitted);

  const before = (await viewBox())!;
  const box = (await page.locator(".graph-canvas").boundingBox())!;
  // Drag from a background corner — node hits would select, not pan.
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 4 });
  await page.mouse.up();
  await expect.poll(viewBox).not.toBe(before);

  await page.getByRole("button", { name: "Fit" }).click();
  await expect.poll(width).toBeCloseTo(fitted, 0);
});

test("reduced motion: every animation has its twin (N10)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const html = buildHarnessHtml({
    bundleJs: fs.readFileSync(BUNDLE_PATH, "utf8"),
    themeCss: FONT_FACE + themeCss(THEMES[0]!),
    bodyClass: THEMES[0]!.bodyClass,
    view: "events",
    scope: LIVE_SCOPE,
    mode: "fixtures",
    responses: POPULATED,
  });
  await page.setContent(html, { waitUntil: "load" });
  await expect(page.locator(".event-entry").first()).toBeVisible();

  // A tick arrives: the deposit pulse must not appear at all (a static
  // flicker is not a reduced-motion twin), and the arrival fade must not
  // animate.
  await page.evaluate(() => {
    interface Fix {
      responses: { "event-head": { items: Array<Record<string, unknown>>; total: number } };
      scope: unknown;
    }
    const fix = (window as unknown as { __fix: Fix }).__fix;
    const head = fix.responses["event-head"];
    head.items = [
      ...head.items,
      {
        sequence: 14,
        version: 15,
        timestamp: 1786000000000000,
        eventType: "agent.step",
        payload: { thought: "quiet arrival" },
        hash: "e9".repeat(32),
        previousHash: "d8".repeat(32),
      },
    ];
    head.total = 15;
    window.postMessage({ kind: "refresh", scope: fix.scope }, "*");
  });
  await expect(page.locator(".event-entry[data-seq='14']")).toBeVisible();
  expect(
    await page.locator(".deposit-pulse").evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).display),
    ),
  ).not.toContain("block");
  expect(
    await page.locator(".event-entry.arrived").evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).animationName),
    ),
  ).not.toContain("st-arrive");

  // Skeletons stand still but stay visible.
  const loadingHtml = buildHarnessHtml({
    bundleJs: fs.readFileSync(BUNDLE_PATH, "utf8"),
    themeCss: FONT_FACE + themeCss(THEMES[0]!),
    bodyClass: THEMES[0]!.bodyClass,
    view: "kv",
    scope: LIVE_SCOPE,
    mode: "silent",
    responses: {},
  });
  await page.setContent(loadingHtml, { waitUntil: "load" });
  await expect(page.locator(".skeleton-row").first()).toBeVisible();
  expect(
    await page.locator(".skeleton-block").first().evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
