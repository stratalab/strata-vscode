/**
 * A protocol-revision-2 connection (AR-2.1/2.3): Unix socket + frame codec +
 * the hello exchange. Both the interactive client and the subscriber ride on
 * this. The hello declares the vendored IDL stamps and read access; the reply
 * is compared for skew (AR-6.1) but never hard-fails the connection.
 */
import * as net from "node:net";
import { IDL_STAMPS } from "../generated";
import { FrameDecoder, encodeFrame } from "./frames";
import {
  HelloRefusedError,
  OwnerAtCapacityError,
  ProtocolViolationError,
  TransportError,
  CODES,
} from "./errors";
import {
  PROTOCOL_VERSION,
  type ClientIdentity,
  type HelloFrame,
  type IdlStamps,
  type ServerHello,
  type SessionAccess,
  type WireErrorEnvelope,
} from "./protocol";

export interface ConnectOptions {
  identity?: ClientIdentity;
  access?: SessionAccess;
  capabilities?: string[];
  helloTimeoutMs?: number;
}

/** AR-6.1: the owner's stamps vs ours, decided at attach. */
export interface SkewReport {
  matches: boolean;
  local: IdlStamps;
  owner: IdlStamps;
  ownerRelease: string;
}

const DEFAULT_HELLO_TIMEOUT_MS = 5_000;

export function defaultIdentity(): ClientIdentity {
  return { name: "strata-vscode", version: "0.1.0", pid: process.pid };
}

export class WireConnection {
  private readonly frameListeners: Array<(frame: unknown) => void> = [];
  private readonly closeListeners: Array<(error?: Error) => void> = [];
  private closed = false;

  private constructor(
    private readonly socket: net.Socket,
    private readonly decoder: FrameDecoder,
    readonly serverHello: ServerHello,
  ) {}

  get skew(): SkewReport {
    return {
      matches:
        this.serverHello.idl.schema_version === IDL_STAMPS.schemaVersion &&
        this.serverHello.idl.generator_version === IDL_STAMPS.generatorVersion,
      local: {
        schema_version: IDL_STAMPS.schemaVersion,
        generator_version: IDL_STAMPS.generatorVersion,
      },
      owner: this.serverHello.idl,
      ownerRelease: this.serverHello.release,
    };
  }

  static connect(socketPath: string, options: ConnectOptions = {}): Promise<WireConnection> {
    const identity = options.identity ?? defaultIdentity();
    const access = options.access ?? "read";
    const hello: HelloFrame = {
      hello: {
        protocol: PROTOCOL_VERSION,
        idl: {
          schema_version: IDL_STAMPS.schemaVersion,
          generator_version: IDL_STAMPS.generatorVersion,
        },
        client: identity,
        access,
        ...(options.capabilities?.length ? { capabilities: options.capabilities } : {}),
      },
    };

    return new Promise<WireConnection>((resolve, reject) => {
      const socket = net.connect(socketPath);
      const decoder = new FrameDecoder();
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new TransportError(`no hello reply within ${options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS} ms`));
      }, options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS);

      const failEarly = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(error);
      };

      socket.once("connect", () => {
        socket.write(encodeFrame(hello));
      });
      socket.once("error", (error) => failEarly(new TransportError(`socket error: ${error.message}`)));
      socket.once("close", () => failEarly(new TransportError("connection closed before hello reply")));

      socket.on("data", (chunk: Buffer) => {
        if (settled) return; // post-hello data handled by the connection instance
        let frames: unknown[];
        try {
          frames = decoder.push(chunk);
        } catch (error) {
          failEarly(new ProtocolViolationError(String(error)));
          return;
        }
        const first = frames.shift();
        if (first === undefined) return;

        const reply = first as { type?: string; data?: ServerHello; error?: WireErrorEnvelope };
        if (reply.type === "ipc_hello" && reply.data) {
          settled = true;
          clearTimeout(timer);
          socket.removeAllListeners("error");
          socket.removeAllListeners("close");
          socket.removeAllListeners("data");
          const connection = new WireConnection(socket, decoder, reply.data);
          connection.wire();
          // Frames pipelined behind the hello (none expected, but legal).
          for (const frame of frames) connection.dispatchFrame(frame);
          resolve(connection);
        } else if (reply.error) {
          const envelope = reply.error;
          failEarly(
            envelope.code === CODES.atCapacity
              ? new OwnerAtCapacityError(envelope)
              : new HelloRefusedError(envelope),
          );
        } else {
          failEarly(new ProtocolViolationError(`unexpected first frame: ${JSON.stringify(first)}`));
        }
      });
    });
  }

  private wire(): void {
    this.socket.on("data", (chunk: Buffer) => {
      let frames: unknown[];
      try {
        frames = this.decoder.push(chunk);
      } catch (error) {
        this.destroy(new ProtocolViolationError(String(error)));
        return;
      }
      for (const frame of frames) this.dispatchFrame(frame);
    });
    this.socket.on("error", (error) => {
      this.destroy(new TransportError(`socket error: ${error.message}`));
    });
    this.socket.on("close", () => {
      this.finish(this.closed ? undefined : new TransportError("connection closed by peer"));
    });
  }

  private dispatchFrame(frame: unknown): void {
    for (const listener of [...this.frameListeners]) listener(frame);
  }

  onFrame(listener: (frame: unknown) => void): () => void {
    this.frameListeners.push(listener);
    return () => {
      const at = this.frameListeners.indexOf(listener);
      if (at >= 0) this.frameListeners.splice(at, 1);
    };
  }

  onClose(listener: (error?: Error) => void): void {
    this.closeListeners.push(listener);
  }

  send(payload: unknown): void {
    if (this.closed || this.socket.destroyed) {
      throw new TransportError("connection is closed");
    }
    this.socket.write(encodeFrame(payload));
  }

  /** Deliberate local close — the peer closing is a TransportError instead. */
  close(): void {
    this.closed = true;
    this.socket.destroy();
  }

  destroy(error: Error): void {
    this.closed = true;
    this.socket.destroy();
    this.finish(error);
  }

  private finished = false;
  private finish(error?: Error): void {
    if (this.finished) return;
    this.finished = true;
    this.closed = true;
    for (const listener of [...this.closeListeners]) listener(error);
  }
}
