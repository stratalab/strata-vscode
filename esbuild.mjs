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

copyCodiconFont();

if (watch) {
  const extCtx = await esbuild.context(extensionOptions);
  const viewCtx = await esbuild.context(viewOptions);
  await Promise.all([extCtx.watch(), viewCtx.watch()]);
} else {
  await esbuild.build(extensionOptions);
  await esbuild.build(viewOptions);
}
