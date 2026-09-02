/**
 * Webview containment (N8/N4): the CSP page allows no network source, and
 * the built view bundle contains no network calls or external URLs.
 */
import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import * as path from "node:path";
import { buildViewHtml } from "../../src/ui/viewHtml";

describe("webview CSP", () => {
  it("locks the page down: default-src none, nonce'd script, no remote sources", () => {
    const html = buildViewHtml("vscode-resource://csp-source", "vscode-resource://script.js");
    expect(html).toContain("default-src 'none'");
    expect(html).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(html).not.toContain("http://");
    expect(html).not.toMatch(/https:\/\/(?!.*csp-source)/);
    // Nonces are fresh per page.
    expect(buildViewHtml("s", "u")).not.toBe(buildViewHtml("s", "u"));
  });

  it("builds self-contained bundles with no network reach (N8)", async () => {
    for (const entry of ["src/views/main.ts", "src/hubView/main.ts"]) {
      const result = await esbuild.build({
        entryPoints: [path.resolve(__dirname, "../../", entry)],
        bundle: true,
        write: false,
        platform: "browser",
        format: "iife",
        target: "es2022",
        loader: { ".css": "text" },
      });
      // XML namespace URIs are identifiers createElementNS requires — they are
      // never fetched. Everything else that smells like network is forbidden.
      const bundle = result.outputFiles[0]!.text.replaceAll("http://www.w3.org/2000/svg", "");
      expect(bundle.length, entry).toBeGreaterThan(10_000);
      for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "importScripts", "https://", "http://"]) {
        expect(bundle.includes(forbidden), `${entry} must not contain ${forbidden}`).toBe(false);
      }
    }
  });
});
