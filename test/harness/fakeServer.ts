/**
 * In-process protocol-revision-2 fake server for unit tests: speaks hello /
 * subscribe / correlated request-response over a real Unix socket, with
 * scriptable stamps, refusals, and per-request handlers. UI and client logic
 * test against this; the real owner is exercised by the integration suite.
 */
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { FrameDecoder, encodeFrame } from "../../src/wire/frames";
import { IDL_STAMPS } from "../../src/generated";

interface RequestEnvelopeSeen {
  id?: number;
  deadline_ms?: number;
  branch?: string;
  space?: string;
  command: Record<string, unknown>;
}

export interface FakeServerOptions {
  stamps?: { schema_version: string; generator_version: string };
  release?: string;
  /** Reply to every hello with this error envelope and close (refusal path). */
  refuseHello?: { class: string; code: string; message?: string };
  /** Never answer the hello (timeout path). */
  silentHello?: boolean;
  /** Request handler; return the response payload, or null to never respond. */
  onRequest?: (envelope: RequestEnvelopeSeen) => unknown | null;
}

export class FakeServer {
  readonly requests: RequestEnvelopeSeen[] = [];
  private readonly sockets = new Set<net.Socket>();
  private readonly subscribed = new Set<net.Socket>();

  private constructor(
    private readonly server: net.Server,
    readonly socketPath: string,
    private readonly root: string,
    private readonly options: FakeServerOptions,
  ) {}

  static start(options: FakeServerOptions = {}): Promise<FakeServer> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "svfk-"));
    const socketPath = path.join(root, "strata.sock");
    const server = net.createServer();
    const fake = new FakeServer(server, socketPath, root, options);
    server.on("connection", (socket) => fake.handle(socket));
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => resolve(fake));
    });
  }

  private handle(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.subscribed.delete(socket);
    });
    socket.on("error", () => socket.destroy());
    const decoder = new FrameDecoder();
    let helloDone = false;
    socket.on("data", (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        const value = frame as Record<string, unknown>;
        if (!helloDone) {
          if (this.options.silentHello) continue;
          if (this.options.refuseHello) {
            socket.write(encodeFrame({ error: this.options.refuseHello }));
            socket.end();
            continue;
          }
          helloDone = true;
          socket.write(
            encodeFrame({
              type: "ipc_hello",
              data: {
                protocol: 2,
                release: this.options.release ?? "1.0.0",
                idl: this.options.stamps ?? {
                  schema_version: IDL_STAMPS.schemaVersion,
                  generator_version: IDL_STAMPS.generatorVersion,
                },
                granted_access: (value.hello as { access?: string } | undefined)?.access ?? "read",
                capabilities: ["notify.version"],
                owner_pid: process.pid,
              },
            }),
          );
        } else if (value.subscribe) {
          this.subscribed.add(socket);
          socket.write(
            encodeFrame({
              id: value.id ?? null,
              payload: {
                type: "ipc_subscribed",
                data: { events: (value.subscribe as { events?: string[] }).events ?? [] },
              },
            }),
          );
        } else {
          const envelope = value as unknown as RequestEnvelopeSeen;
          this.requests.push(envelope);
          const payload = this.options.onRequest
            ? this.options.onRequest(envelope)
            : { type: "pong", data: {} };
          if (payload === null) continue; // scripted non-response (timeout path)
          socket.write(encodeFrame({ id: envelope.id ?? null, payload }));
        }
      }
    });
  }

  /** Pushes a version tick to every SUBSCRIBED socket (wire fidelity). */
  notify(version: number): void {
    for (const socket of this.subscribed) {
      socket.write(encodeFrame({ notify: { event: "version", version } }));
    }
  }

  /** Sends an arbitrary frame to every connected socket (protocol-abuse tests). */
  sendRaw(frame: unknown): void {
    for (const socket of this.sockets) {
      socket.write(encodeFrame(frame));
    }
  }

  /** Drops every connection without ceremony (owner-death simulation). */
  dropConnections(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  close(): Promise<void> {
    this.dropConnections();
    return new Promise((resolve) => {
      this.server.close(() => {
        fs.rmSync(this.root, { recursive: true, force: true });
        resolve();
      });
    });
  }
}
