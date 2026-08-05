/**
 * Typed wire errors (AR-2.7, N3): behavior keys on `class` + `code`, never
 * message text; unknown codes degrade to class-level handling.
 */
import type { WireErrorEnvelope } from "./protocol";

/** Registered transport codes the client dispatches on by name. */
export const CODES = {
  helloRefused: "invalid_argument.executor.ipc_hello",
  malformedRequest: "invalid_argument.executor.wire_request",
  readOnlySession: "access_denied.executor.read_only_session",
  deadlineShed: "unavailable.executor.ipc_deadline",
  atCapacity: "resource_exhausted.executor.ipc_connections",
  transportLost: "unavailable.executor.ipc_transport",
  wireResponse: "internal.executor.wire_response",
} as const;

/** Base for everything thrown by the wire layer. */
export class WireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The socket died or the stream became unusable (owner death, reset). In-doubt. */
export class TransportError extends WireError {}

/** The peer violated the protocol (bad frame, correlation mismatch). Connection-fatal. */
export class ProtocolViolationError extends WireError {}

/** The owner refused the hello — a version-mismatch state, never retried (AR-2.3). */
export class HelloRefusedError extends WireError {
  constructor(readonly envelope: WireErrorEnvelope) {
    super(`owner refused hello: ${envelope.message ?? envelope.code}`);
  }
}

/** The owner is at its connection cap — back off and retry (AR-2.7). */
export class OwnerAtCapacityError extends WireError {
  constructor(readonly envelope: WireErrorEnvelope) {
    super(`owner at connection capacity: ${envelope.message ?? envelope.code}`);
  }
}

/** The request timed out client-side (transport hang the server cannot shed). */
export class RequestTimeoutError extends WireError {
  constructor(readonly deadlineMs: number) {
    super(`no response within the transport timeout (deadline ${deadlineMs} ms)`);
  }
}

/** A command-level error envelope from the owner. */
export class CommandFailedError extends WireError {
  readonly errorClass: string;
  readonly code: string;
  readonly retryPolicy: string | undefined;
  readonly commitOutcome: string | undefined;

  constructor(readonly envelope: WireErrorEnvelope) {
    super(envelope.message ?? envelope.code);
    this.errorClass = envelope.class;
    this.code = envelope.code;
    this.retryPolicy = envelope.retry_policy;
    this.commitOutcome = envelope.commit_outcome;
  }
}

/**
 * The owner shed the request before execution — provably not executed
 * (`commit_outcome: not_started`), retryable with the same request (AR-2.5).
 */
export class DeadlineShedError extends CommandFailedError {}

/**
 * The owner's dispatch gate refused a write on this read session. The client
 * gate should have made this unsendable — receiving it is a client bug
 * (AR-4.3), surfaced as a diagnostic, not user-facing permission UX.
 */
export class ReadOnlySessionViolationError extends CommandFailedError {}

/**
 * The client-side gate (AR-4.2): a write-classified command was handed to a
 * read-only client. Thrown locally — no round trip is wasted.
 */
export class WriteCommandBlockedError extends WireError {
  constructor(readonly commandId: string) {
    super(`${commandId} is write-classified; StrataDB for VS Code v1 is read-only`);
  }
}

/** Maps a command-level error envelope to its typed error (N3). */
export function errorFromEnvelope(envelope: WireErrorEnvelope): CommandFailedError {
  switch (envelope.code) {
    case CODES.deadlineShed:
      return new DeadlineShedError(envelope);
    case CODES.readOnlySession:
      return new ReadOnlySessionViolationError(envelope);
    default:
      // Unknown codes intentionally degrade to the generic class-carrying error.
      return new CommandFailedError(envelope);
  }
}
