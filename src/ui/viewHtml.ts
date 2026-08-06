/**
 * The strict-CSP webview page (N8): no network access of any kind, nonce'd
 * script from the extension bundle only, and — when given — the bundled
 * codicon font via @font-face (font-src is already limited to the extension
 * origin). Pure — unit-tested directly.
 */
import * as crypto from "node:crypto";

export function buildViewHtml(cspSource: string, scriptUri: string, fontUri?: string): string {
  const nonce = crypto.randomBytes(16).toString("base64");
  const fontFace = fontUri
    ? `<style>@font-face { font-family: "codicon"; font-display: block; src: url("${fontUri}") format("truetype"); }</style>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource}; font-src ${cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>StrataDB</title>
${fontFace}</head>
<body>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
