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

function main(): void {
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  const root = document.createElement("main");
  root.className = "strata-view";
  document.body.append(root);

  const rpc: ViewRpc = new ViewRpc((view) => {
    let instance: { reload(): Promise<void> };
    switch (view) {
      case "kv":
        instance = new KvTableView(root, rpc);
        break;
      case "json":
        instance = new JsonBrowserView(root, rpc);
        break;
      case "events":
        instance = new EventFeedView(root, rpc);
        break;
      case "vectors":
        instance = new VectorBrowserView(root, rpc);
        break;
      case "graph":
        instance = new GraphCanvasView(root, rpc);
        break;
      default:
        root.textContent = `unknown view: ${view}`;
        return;
    }
    void instance.reload();
  });
}

main();
