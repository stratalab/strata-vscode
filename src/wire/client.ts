/**
 * The interactive connection (AR-2.4): all tree/inspector/console requests,
 * one in-flight at a time, correlation ids verified on every response, a
 * deadline on every request (AR-2.5), explicit branch/space (AR-2.6), and the
 * client-side write gate (AR-4.2/4.3).
 */
import { COMMANDS, WIRE_TYPE_TO_COMMAND } from "../generated";
import type { CommandCatalogEntry, CommandId, CommandRequests, CommandResponses, ReadCommandId } from "../generated";
import { WireConnection, type ConnectOptions, type SkewReport } from "./connection";
import {
  ProtocolViolationError,
  ReadOnlySessionViolationError,
  RequestTimeoutError,
  TransportError,
  WriteCommandBlockedError,
  errorFromEnvelope,
} from "./errors";
import {
  isResponseFrame,
  payloadError,
  type RequestEnvelope,
  type ResponsePayload,
  type ServerHello,
} from "./protocol";

/** Deadline budgets per request class (AR-2.5; user-configurable via AR-7.3). */
export interface DeadlineBudgets {
  fast: number;
  paged: number;
  expensive: number;
}

export const DEFAULT_BUDGETS: DeadlineBudgets = {
  fast: 2_000,
  paged: 10_000,
  expensive: 60_000,
};

/** Client transport timeout margin above the wire deadline (AR-2.5). */
export const TRANSPORT_TIMEOUT_MARGIN_MS = 2_000;

export type RequestClass = keyof DeadlineBudgets;

/** Derives a command's default request class from its catalog facets. */
export function classifyCommand(entry: CommandCatalogEntry): RequestClass {
  if (entry.kind === "read.analytics" || entry.kind === "read.search" || entry.family === "arrow") {
    return "expensive";
  }
  if (entry.pagination !== "none") return "paged";
  return "fast";
}

export interface RequestOptions {
  /** AR-2.6: every request names its branch explicitly. */
  branch: string;
  space?: string;
  deadlineMs?: number;
  requestClass?: RequestClass;
}

export interface ClientDiagnostic {
  kind: "client-gate-bug";
  commandId: string | null;
  detail: string;
}

export interface InteractiveClientOptions extends ConnectOptions {
  budgets?: Partial<DeadlineBudgets>;
  /** Test hook: overrides TRANSPORT_TIMEOUT_MARGIN_MS. */
  transportMarginMs?: number;
}

export class InteractiveClient {
  private nextId = 0;
  private queueTail: Promise<unknown> = Promise.resolve();
  private pending: { id: number; resolve: (p: ResponsePayload) => void; reject: (e: Error) => void } | null = null;
  private readonly budgets: DeadlineBudgets;
  private readonly diagnosticListeners: Array<(d: ClientDiagnostic) => void> = [];
  private closeError: Error | undefined;

  private readonly transportMarginMs: number;

  private constructor(
    private readonly connection: WireConnection,
    options: InteractiveClientOptions,
  ) {
    this.budgets = { ...DEFAULT_BUDGETS, ...options.budgets };
    this.transportMarginMs = options.transportMarginMs ?? TRANSPORT_TIMEOUT_MARGIN_MS;
    connection.onFrame((frame) => this.handleFrame(frame));
    connection.onClose((error) => {
      this.closeError = error;
      if (this.pending) {
        const failure = error ?? new TransportError("connection closed");
        this.pending.reject(failure);
        this.pending = null;
      }
    });
  }

  static async connect(socketPath: string, options: InteractiveClientOptions = {}): Promise<InteractiveClient> {
    const connection = await WireConnection.connect(socketPath, { ...options, access: "read" });
    return new InteractiveClient(connection, options);
  }

  get hello(): ServerHello {
    return this.connection.serverHello;
  }

  get skew(): SkewReport {
    return this.connection.skew;
  }

  onDiagnostic(listener: (d: ClientDiagnostic) => void): void {
    this.diagnosticListeners.push(listener);
  }

  /** Fires when the connection dies for any reason (owner death, protocol violation). */
  onClose(listener: (error?: Error) => void): void {
    this.connection.onClose(listener);
  }

  /**
   * Sends a catalog command. The payload is the generated request type minus
   * its `type` tag (injected from the catalog). Write-classified commands are
   * blocked locally (AR-4.2) — no round trip is wasted.
   */
  async request<C extends ReadCommandId>(
    commandId: C,
    payload: Omit<CommandRequests[C], "type">,
    options: RequestOptions,
  ): Promise<CommandResponses[C]> {
    const entry = COMMANDS[commandId];
    if (entry.access === "write") throw new WriteCommandBlockedError(commandId);
    const wireCommand = { type: entry.wireType, ...(payload as Record<string, unknown>) };
    const requestClass = options.requestClass ?? classifyCommand(entry);
    const responsePayload = await this.dispatch(wireCommand, options, requestClass, commandId);
    // Error payloads have already thrown in dispatch; what remains is the
    // command's success envelope.
    return responsePayload as unknown as CommandResponses[C];
  }

  /**
   * Sends a raw wire command object (the console's raw-JSON mode). Known
   * write-classified wire types are still blocked locally; unknown types pass
   * through — the owner's gate is the enforcement boundary (AR-4.1).
   */
  async requestRaw(
    command: Record<string, unknown>,
    options: RequestOptions & { deadlineMs: number },
  ): Promise<ResponsePayload> {
    const wireType = typeof command.type === "string" ? command.type : null;
    const known = wireType ? WIRE_TYPE_TO_COMMAND[wireType] : undefined;
    if (known && COMMANDS[known].access === "write") {
      throw new WriteCommandBlockedError(known);
    }
    return this.dispatch(command, options, "fast", known ?? null, options.deadlineMs);
  }

  private dispatch(
    command: Record<string, unknown>,
    options: RequestOptions,
    requestClass: RequestClass,
    commandId: CommandId | null,
    explicitDeadline?: number,
  ): Promise<ResponsePayload> {
    const run = async (): Promise<ResponsePayload> => {
      if (this.closeError) throw this.closeError;
      const deadlineMs = explicitDeadline ?? options.deadlineMs ?? this.budgets[requestClass];
      const id = ++this.nextId;
      const envelope: RequestEnvelope = {
        id,
        deadline_ms: deadlineMs,
        branch: options.branch,
        ...(options.space !== undefined ? { space: options.space } : {}),
        command,
      };

      const payload = await new Promise<ResponsePayload>((resolve, reject) => {
        this.pending = { id, resolve, reject };
        const timer = setTimeout(() => {
          // The in-flight case the server cannot shed (AR-2.5): give up
          // client-side slightly above the wire deadline and treat the
          // connection as wedged.
          this.pending = null;
          this.connection.destroy(new TransportError(`request ${id} timed out client-side`));
          reject(new RequestTimeoutError(deadlineMs));
        }, deadlineMs + this.transportMarginMs);
        const settle = (fn: (v: never) => void) => (value: never) => {
          clearTimeout(timer);
          fn(value);
        };
        this.pending.resolve = settle(resolve) as typeof resolve;
        this.pending.reject = settle(reject) as typeof reject;
        try {
          this.connection.send(envelope);
        } catch (error) {
          this.pending = null;
          clearTimeout(timer);
          reject(error as Error);
        }
      });

      const errorEnvelope = payloadError(payload);
      if (errorEnvelope) {
        const failure = errorFromEnvelope(errorEnvelope);
        if (failure instanceof ReadOnlySessionViolationError) {
          // AR-4.3: the owner's gate caught what ours should have — a client
          // bug or catalog skew, logged as such.
          this.emitDiagnostic({
            kind: "client-gate-bug",
            commandId,
            detail: `owner refused ${String(command.type)} on the read session: ${errorEnvelope.code}`,
          });
        }
        throw failure;
      }
      return payload;
    };

    // Single in-flight (AR-2.4): each request queues behind the previous one,
    // failures included — a failed predecessor must not sink its successors.
    const turn = this.queueTail.then(run, run);
    this.queueTail = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  private handleFrame(frame: unknown): void {
    if (!isResponseFrame(frame)) {
      this.connection.destroy(
        new ProtocolViolationError(`unexpected frame on interactive connection: ${JSON.stringify(frame)}`),
      );
      return;
    }
    const pending = this.pending;
    if (!pending) {
      this.connection.destroy(new ProtocolViolationError(`response with no request in flight (id ${frame.id})`));
      return;
    }
    if (frame.id !== pending.id) {
      this.pending = null;
      const violation = new ProtocolViolationError(
        `correlation mismatch: expected id ${pending.id}, got ${frame.id}`,
      );
      pending.reject(violation);
      this.connection.destroy(violation);
      return;
    }
    this.pending = null;
    pending.resolve(frame.payload);
  }

  private emitDiagnostic(diagnostic: ClientDiagnostic): void {
    for (const listener of [...this.diagnosticListeners]) listener(diagnostic);
  }

  close(): void {
    this.connection.close();
  }
}
