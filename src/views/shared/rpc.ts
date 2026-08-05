/**
 * The view side of the E8 message protocol: request/response over
 * postMessage with a scope the host keeps current (ticks, scrub moves).
 */
import type { ExtToView, ViewErrorShape, ViewOp, ViewScope } from "./messages";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export class ViewRpcError extends Error {
  constructor(readonly shape: ViewErrorShape) {
    super(shape.message);
  }
}

export class ViewRpc {
  private readonly vscode = acquireVsCodeApi();
  private nextReqId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (data: unknown) => void; reject: (error: ViewRpcError) => void }
  >();
  private scopeListeners: Array<(scope: ViewScope) => void> = [];
  scope: ViewScope | null = null;

  constructor(onInit: (view: string, scope: ViewScope, focus?: string) => void) {
    window.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as ExtToView;
      if (message.kind === "init") {
        this.scope = message.scope;
        onInit(message.view, message.scope, message.focus);
      } else if (message.kind === "refresh") {
        this.scope = message.scope;
        for (const listener of [...this.scopeListeners]) listener(message.scope);
      } else if (message.kind === "response") {
        const waiter = this.pending.get(message.reqId);
        if (!waiter) return;
        this.pending.delete(message.reqId);
        if (message.ok) waiter.resolve(message.data);
        else waiter.reject(new ViewRpcError(message.error));
      }
    });
  }

  /** Fires on ticks and scrub moves — views re-pull what they show (AR-5). */
  onScopeChange(listener: (scope: ViewScope) => void): void {
    this.scopeListeners.push(listener);
  }

  request<T>(op: ViewOp): Promise<T> {
    const reqId = ++this.nextReqId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve: resolve as (d: unknown) => void, reject });
      this.vscode.postMessage({ kind: "request", reqId, payload: op });
    });
  }
}
