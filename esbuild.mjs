import esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");

/** The codicon font ships beside the view bundle; the host page injects the
 * @font-face with the correct webview URI (XC-2). */
function copyCodiconFont() {
  fs.mkdirSync("dist/views", { recursive: true });
  fs.copyFileSync("node_modules/@vscode/codicons/dist/codicon.ttf", "dist/views/codicon.ttf");
}

/** @type {import("esbuild").BuildOptions} */
const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

/** The F4 webview bundle (E8): browser platform, fully self-contained (N8). */
/** @type {import("esbuild").BuildOptions} */
const viewOptions = {
  entryPoints: ["src/views/main.ts"],
  outfile: "dist/views/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  loader: { ".css": "text" },
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

/** The StrataHub catalog browser is isolated from extension-host networking. */
/** @type {import("esbuild").BuildOptions} */
const hubViewOptions = {
  entryPoints: ["src/hubView/main.ts"],
  outfile: "dist/hub/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  loader: { ".css": "text" },
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

/** Setup and health panel bundle; all checks run in the extension host. */
/** @type {import("esbuild").BuildOptions} */
const statusViewOptions = {
  entryPoints: ["src/statusView/main.ts"],
  outfile: "dist/status/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  loader: { ".css": "text" },
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

/** AI agent side-panel bundle; host owns all clipboard/docs/actions. */
/** @type {import("esbuild").BuildOptions} */
const agentViewOptions = {
  entryPoints: ["src/agentView/main.ts"],
  outfile: "dist/agent/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  loader: { ".css": "text" },
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

copyCodiconFont();

if (watch) {
  const extCtx = await esbuild.context(extensionOptions);
  const viewCtx = await esbuild.context(viewOptions);
  const hubViewCtx = await esbuild.context(hubViewOptions);
  const statusViewCtx = await esbuild.context(statusViewOptions);
  const agentViewCtx = await esbuild.context(agentViewOptions);
  await Promise.all([extCtx.watch(), viewCtx.watch(), hubViewCtx.watch(), statusViewCtx.watch(), agentViewCtx.watch()]);
} else {
  await esbuild.build(extensionOptions);
  await esbuild.build(viewOptions);
  await esbuild.build(hubViewOptions);
  await esbuild.build(statusViewOptions);
  await esbuild.build(agentViewOptions);
}
