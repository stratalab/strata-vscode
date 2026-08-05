import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

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
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

if (watch) {
  const extCtx = await esbuild.context(extensionOptions);
  const viewCtx = await esbuild.context(viewOptions);
  await Promise.all([extCtx.watch(), viewCtx.watch()]);
} else {
  await esbuild.build(extensionOptions);
  await esbuild.build(viewOptions);
}
