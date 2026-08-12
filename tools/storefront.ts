/**
 * Storefront assets (U12 / FR-3): the marketplace icon, the README hero GIF
 * (the feed ticking live, then a scrub into the past), and the listing
 * screenshots — all rendered from the same bundle + fixtures the visual
 * matrix uses, so the storefront can never drift from the product.
 *
 *   npm run storefront   # rebuilds the bundle, regenerates media/
 *
 * Outputs: media/icon.png (from media/icon.svg), media/readme/hero.gif,
 * media/readme/<view>.png. The readme assets are repo-hosted only — vsce
 * rewrites relative README links to GitHub raw URLs, so .vscodeignore keeps
 * them out of the .vsix.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { buildHarnessHtml } from "../test/visual/harness";
import { THEMES, themeCss } from "../test/visual/themes";
import { LIVE_SCOPE, POPULATED, SCRUBBED_SCOPE } from "../test/visual/fixtures";
import type { ViewKind, ViewScope } from "../src/views/shared/messages";

const ROOT = path.resolve(__dirname, "..");
const BUNDLE_PATH = path.join(ROOT, "dist/views/main.js");
const README_OUT = path.join(ROOT, "media/readme");

/** Same inlined codicon font the visual matrix uses (test/visual/views.spec.ts). */
const FONT_FACE = `@font-face { font-family: "codicon"; font-display: block; src: url("data:font/ttf;base64,${fs
  .readFileSync(require.resolve("@vscode/codicons/dist/codicon.ttf"))
  .toString("base64")}") format("truetype"); }`;

const DARK = THEMES.find((t) => t.name === "dark-modern")!;

function pageHtml(view: ViewKind, scope: ViewScope): string {
  return buildHarnessHtml({
    bundleJs: fs.readFileSync(BUNDLE_PATH, "utf8"),
    themeCss: FONT_FACE + themeCss(DARK),
    bodyClass: DARK.bodyClass,
    view,
    scope,
    mode: "fixtures",
    responses: POPULATED,
  });
}

async function renderIcon(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const svg = fs.readFileSync(path.join(ROOT, "media/icon.svg"), "utf8");
  await page.setContent(`<!DOCTYPE html><body style="margin:0">${svg}</body>`);
  const buffer = await page.locator("svg").screenshot({ omitBackground: true });
  fs.writeFileSync(path.join(ROOT, "media/icon.png"), buffer);
  await context.close();
  console.log(`media/icon.png (${buffer.length} B)`);
}

/** Drive each view to the state its screenshot should tell (mirrors the
 * matrix's interact() so listing imagery never shows an unreachable state). */
const SHOTS: Array<{
  file: string;
  view: ViewKind;
  scope: ViewScope;
  /** Viewport height fitted to the fixture's content — listing stills
   * should be dense, not two-thirds empty surface. */
  height: number;
  enrich?: (page: Page) => Promise<void>;
}> = [
  {
    file: "kv.png",
    view: "kv",
    scope: LIVE_SCOPE,
    height: 560,
    enrich: async (page) => {
      await page.locator("tbody tr").first().click();
      await page.locator(".rail-entry").first().waitFor();
    },
  },
  {
    file: "json.png",
    view: "json",
    scope: LIVE_SCOPE,
    height: 620,
    enrich: async (page) => {
      await page.locator(".doc-item").first().click();
      await page.locator(".rail-entry").first().waitFor();
      await page.locator(".rail-entry").nth(1).click();
      await page.locator(".diff-note").waitFor();
    },
  },
  {
    file: "events.png",
    view: "events",
    scope: LIVE_SCOPE,
    height: 620,
    enrich: async (page) => {
      await page.locator(".event-head").nth(1).click();
      await page.getByRole("button", { name: "Verify chain" }).click();
      await page.locator(".chain-ok-chip").waitFor();
    },
  },
  {
    file: "vectors.png",
    view: "vectors",
    scope: LIVE_SCOPE,
    height: 640,
    enrich: async (page) => {
      await page.locator(".card").first().click();
      await page.getByRole("button", { name: "history" }).first().click();
      await page.locator(".rail-entry").first().waitFor();
    },
  },
  { file: "graph.png", view: "graph", scope: LIVE_SCOPE, height: 720 },
  {
    file: "kv-asof.png",
    view: "kv",
    scope: SCRUBBED_SCOPE,
    height: 560,
    enrich: async (page) => {
      await page.locator("tbody tr").first().click();
      await page.locator(".rail-entry").first().waitFor();
    },
  },
];

async function renderShots(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    timezoneId: "UTC",
    locale: "en-US",
  });
  for (const shot of SHOTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: shot.height });
    await page.setContent(pageHtml(shot.view, shot.scope), { waitUntil: "load" });
    await page.locator(".scope-banner").waitFor();
    await shot.enrich?.(page);
    // Let arrival fades and focus rings settle before the still.
    await page.waitForTimeout(700);
    const file = path.join(README_OUT, shot.file);
    await page.screenshot({ path: file });
    await page.close();
    console.log(`media/readme/${shot.file} (${fs.statSync(file).size} B)`);
  }
  await context.close();
}

/** The fixture clock's zero (fixtures.ts t(0)), recovered from the scrubbed
 * scope so the hero's timestamps stay on the same afternoon as the story. */
const T0 = (SCRUBBED_SCOPE.asOfMicros as number) - 18 * 60_000_000;
const minute = (m: number): number => T0 + m * 60_000_000;

/** The two arrivals the hero shows landing, continuing the fixture chain. */
const ARRIVALS: Array<Record<string, unknown>> = [
  {
    sequence: 14,
    version: 15,
    timestamp: minute(42),
    eventType: "memory.write",
    payload: { key: "note:decision-log", bytes: 412 },
    hash: "e9".repeat(32),
    previousHash: "d8".repeat(32),
  },
  {
    sequence: 15,
    version: 16,
    timestamp: minute(43),
    eventType: "memory.write",
    payload: { key: "note:standup-summary", bytes: 298 },
    hash: "fa".repeat(32),
    previousHash: "e9".repeat(32),
  },
];

/** Where the hero scrubs to: 14:38, the handoff — later events must vanish,
 * because a scrub shows the database as it was, not a tinted overlay. */
const HERO_PAST: ViewScope = {
  ...SCRUBBED_SCOPE,
  asOfMicros: minute(38),
  asOfLabel: "Aug 5, 2026, 14:38:00",
};

async function renderHero(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 960, height: 420 },
    deviceScaleFactor: 1,
    timezoneId: "UTC",
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.setContent(pageHtml("events", LIVE_SCOPE), { waitUntil: "load" });
  await page.locator(".event-entry").first().waitFor();
  await page.waitForTimeout(600); // initial arrival fades settle

  const frames: Array<{ png: Buffer; delay: number }> = [];
  const snap = async (delay: number): Promise<void> => {
    frames.push({ png: await page.screenshot(), delay });
  };

  await snap(1300); // the live feed, at rest

  // Two events land — deposit pulse and arrival fade play in real time.
  for (const event of ARRIVALS) {
    await page.evaluate((evt) => {
      interface Fix {
        responses: { "event-head": { items: unknown[]; total: number } };
        scope: unknown;
      }
      const fix = (window as unknown as { __fix: Fix }).__fix;
      const head = fix.responses["event-head"];
      head.items = [...head.items, evt];
      head.total += 1;
      window.postMessage({ kind: "refresh", scope: fix.scope }, "*");
    }, event);
    for (let i = 0; i < 7; i++) {
      await snap(110);
      await page.waitForTimeout(40);
    }
    await snap(900);
  }

  // Then the scrub: the whole view steps into the past — the wash comes on
  // and the events after 14:38 vanish, because that is what "as of" means.
  await page.evaluate((scope) => {
    interface Fix {
      responses: { "event-head": { items: Array<{ sequence: number }>; total: number } };
    }
    const win = window as unknown as { __fix: Fix; __live?: { items: unknown[]; total: number } };
    const head = win.__fix.responses["event-head"];
    win.__live = { items: head.items, total: head.total };
    head.items = head.items.filter((event) => event.sequence <= 12);
    head.total = 13;
    window.postMessage({ kind: "refresh", scope }, "*");
  }, HERO_PAST as unknown as Record<string, unknown>);
  for (let i = 0; i < 4; i++) {
    await snap(140);
    await page.waitForTimeout(50);
  }
  await snap(2400); // hold the past: amber wash, as-of banner

  // And back to now, so the loop closes where it began.
  await page.evaluate((scope) => {
    interface Fix {
      responses: { "event-head": { items: unknown[]; total: number } };
    }
    const win = window as unknown as { __fix: Fix; __live?: { items: unknown[]; total: number } };
    const head = win.__fix.responses["event-head"];
    if (win.__live) {
      head.items = win.__live.items;
      head.total = win.__live.total;
    }
    window.postMessage({ kind: "refresh", scope }, "*");
  }, LIVE_SCOPE as unknown as Record<string, unknown>);
  await page.waitForTimeout(200);
  await snap(1000);
  await context.close();

  const gif = GIFEncoder();
  for (const frame of frames) {
    const decoded = PNG.sync.read(frame.png);
    const rgba = new Uint8Array(decoded.data);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, decoded.width, decoded.height, { palette, delay: frame.delay });
  }
  gif.finish();
  const file = path.join(README_OUT, "hero.gif");
  fs.writeFileSync(file, Buffer.from(gif.bytes()));
  console.log(`media/readme/hero.gif (${frames.length} frames, ${fs.statSync(file).size} B)`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(`webview bundle missing at ${BUNDLE_PATH} — run \`npm run build\` first`);
  }
  fs.mkdirSync(README_OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    await renderIcon(browser);
    await renderShots(browser);
    await renderHero(browser);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
