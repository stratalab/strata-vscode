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
      break;
    case "events":
      await page.locator(".event-head").nth(1).click();
      await expect(page.locator(".event-hashes")).toBeVisible();
      await page.getByRole("button", { name: "verify chain" }).click();
      await expect(page.locator(".chain-ok")).toBeVisible();
      break;
    case "vectors":
      await page.locator(".card").first().click();
      await expect(page.locator(".vector-table")).toBeVisible();
      await page.getByRole("button", { name: "history" }).first().click();
      await expect(page.locator(".rail-entry").first()).toBeVisible();
      break;
    case "graph":
      // A single graph auto-opens; select+expand the first node.
      await page.locator(".graph-node").first().click();
      await expect(page.locator(".sidebar-title").nth(1)).toBeVisible();
      await expect(page.locator(".truncation")).toBeVisible();
      break;
  }
}

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: unknown }>;
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
      nodes: v.nodes.map((n) => ({ target: n.target })),
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
