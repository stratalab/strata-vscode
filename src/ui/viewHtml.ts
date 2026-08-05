/**
 * The strict-CSP webview page (N8): no network access of any kind, nonce'd
 * script from the extension bundle only. Pure — unit-tested directly.
 */
import * as crypto from "node:crypto";

export function buildViewHtml(cspSource: string, scriptUri: string): string {
  const nonce = crypto.randomBytes(16).toString("base64");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource}; font-src ${cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>StrataDB</title>
</head>
<body>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
