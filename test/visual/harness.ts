/**
 * Visual harness (U1): builds a self-contained HTML page that runs the real
 * webview bundle against fixture data — no VS Code, no sockets. The inline
 * stub plays the extension host's half of the E8 protocol: it answers
 * `{kind:"request"}` messages from fixtures and posts the initial
 * `{kind:"init"}`. Everything is inlined so the page needs no server and no
 * file paths — mirroring the strict no-network posture of the real webview.
 */
import type { ViewKind, ViewScope } from "../../src/views/shared/messages";

/** How the stub answers requests. */
export type HarnessMode =
  | "fixtures" // answer each op from the responses map
  | "silent" // never answer — freezes the view in its loading state
  | "error"; // answer every op with the fixture error envelope

export interface HarnessSpec {
  bundleJs: string;
  themeCss: string;
  bodyClass: string;
  view: ViewKind;
  scope: ViewScope;
  mode: HarnessMode;
  /** op name → response data; `__error` holds the error-mode envelope. */
  responses: Record<string, unknown>;
}

export function buildHarnessHtml(spec: HarnessSpec): string {
  const config = JSON.stringify({ mode: spec.mode, responses: spec.responses });
  const init = JSON.stringify({ kind: "init", view: spec.view, scope: spec.scope });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>StrataDB</title>
<style>${spec.themeCss}</style>
</head>
<body class="${spec.bodyClass}">
<script>
(function () {
  var FIX = ${config};
  window.acquireVsCodeApi = function () {
    return {
      postMessage: function (msg) {
        if (!msg || msg.kind !== "request") return;
        if (FIX.mode === "silent") return;
        var op = msg.payload && msg.payload.op;
        if (op === "scrub" || op === "open-docs") {
          window.postMessage({ kind: "response", reqId: msg.reqId, ok: true, data: null }, "*");
          return;
        }
        if (FIX.mode === "error") {
          window.postMessage(
            { kind: "response", reqId: msg.reqId, ok: false, error: FIX.responses.__error },
            "*"
          );
          return;
        }
        if (Object.prototype.hasOwnProperty.call(FIX.responses, op)) {
          window.postMessage(
            { kind: "response", reqId: msg.reqId, ok: true, data: FIX.responses[op] },
            "*"
          );
        } else {
          window.postMessage(
            {
              kind: "response",
              reqId: msg.reqId,
              ok: false,
              error: {
                class: "harness",
                code: "harness.unstubbed_op",
                message: "no fixture for op: " + op,
                retention: false,
              },
            },
            "*"
          );
        }
      },
      getState: function () { return undefined; },
      setState: function () {},
    };
  };
})();
</script>
<script>${spec.bundleJs}</script>
<script>window.postMessage(${init}, "*");</script>
</body>
</html>`;
}
