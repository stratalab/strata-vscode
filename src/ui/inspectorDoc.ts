/**
 * Read-only inspector documents: `strata-inspect:` virtual JSON documents
 * that re-render on tick-driven refresh while open (F1.4).
 */
import * as vscode from "vscode";

export const INSPECT_SCHEME = "strata-inspect";

export class InspectorDocuments implements vscode.TextDocumentContentProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;
  private readonly contents = new Map<string, string>();
  private readonly refreshers = new Map<string, () => Promise<string>>();

  /** Registers content and returns its uri without opening an editor (diff views). */
  register(title: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({
      scheme: INSPECT_SCHEME,
      path: `/${title.replace(/[/\\]/g, "_")}.json`,
    });
    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
    return uri;
  }

  async open(title: string, content: string, refresh?: () => Promise<string>): Promise<void> {
    const uri = vscode.Uri.from({
      scheme: INSPECT_SCHEME,
      path: `/${title.replace(/[/\\]/g, "_")}.json`,
    });
    this.contents.set(uri.toString(), content);
    if (refresh) this.refreshers.set(uri.toString(), refresh);
    this.emitter.fire(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(document, "json");
    await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });
  }

  /** Re-renders every open inspector — called on debounced ticks (AR-5.4). */
  async refreshAll(): Promise<void> {
    for (const [key, refresh] of this.refreshers) {
      const open = vscode.workspace.textDocuments.some(
        (doc) => doc.uri.toString() === key && !doc.isClosed,
      );
      if (!open) {
        this.refreshers.delete(key);
        this.contents.delete(key);
        continue;
      }
      try {
        this.contents.set(key, await refresh());
        this.emitter.fire(vscode.Uri.parse(key));
      } catch {
        // The row may be gone; the stale content stands until reopened.
      }
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "// closed";
  }
}
