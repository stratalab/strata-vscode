/**
 * Webview entry (E8): routes the init message to the right view. One bundle
 * serves all five views; styles live in the shared Strata UI layer
 * (shared/styles.ts — theme tokens throughout, N8, reduced motion honored,
 * N10). The root is a <main> landmark and each view's banner carries the
 * page's h1, so every page has real document structure.
 */
import { ViewRpc } from "./shared/rpc";
import { STYLES } from "./shared/styles";
import { KvTableView } from "./kvTable";
import { JsonBrowserView } from "./jsonBrowser";
import { EventFeedView } from "./eventFeed";
import { VectorBrowserView } from "./vectorBrowser";
import { GraphCanvasView } from "./graphCanvas";
import type { ViewFocus } from "./shared/messages";

function main(): void {
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  const root = document.createElement("main");
  root.className = "strata-view";
  document.body.append(root);

  let instance: { reload(): Promise<void>; focus?(focus: ViewFocus): Promise<void> } | null = null;
  const rpc: ViewRpc = new ViewRpc((view, _scope, focus) => {
    let next: { reload(): Promise<void>; focus?(focus: ViewFocus): Promise<void> };
    switch (view) {
      case "kv":
        next = new KvTableView(root, rpc, focus ?? null);
        break;
      case "json":
        next = new JsonBrowserView(root, rpc);
        break;
      case "events":
        next = new EventFeedView(root, rpc);
        break;
      case "vectors":
        next = new VectorBrowserView(root, rpc);
        break;
      case "graph":
        next = new GraphCanvasView(root, rpc);
        break;
      default:
        root.textContent = `unknown view: ${view}`;
        return;
    }
    instance = next;
    void instance.reload();
  });
  rpc.onFocus((focus) => void instance?.focus?.(focus));

  // SIG-3: each live tick deposits a line — history visibly accumulating.
  // Scrubbed refreshes don't pulse; the past doesn't accrete. Removal is
  // timer-based so reduced-motion (which disables the animation) never
  // leaves a stray element behind.
  rpc.onScopeChange((scope) => {
    if (scope.asOfLabel) return;
    document.querySelector(".deposit-pulse")?.remove();
    const line = document.createElement("div");
    line.className = "deposit-pulse";
    document.body.append(line);
    setTimeout(() => line.remove(), 600);
  });
}

main();
