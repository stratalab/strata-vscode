/**
 * A deliberately independent wire session for integration tests: framing is
 * hand-rolled here (4-byte BE length + JSON) so real-host tests never trust
 * the src/wire codec they are testing — the same discipline as upstream's
 * raw_wire module in ipc_start_stop.rs.
 */
import * as net from "node:net";
import type { TranscriptRecorder } from "./transcript";

export class RawSession {
  private buffer: Buffer = Buffer.alloc(0);
  private waiters: Array<{ resolve: (frame: unknown) => void; reject: (e: Error) => void }> = [];
  private ready: unknown[] = [];
  private closedError: Error | null = null;

  private constructor(
    private readonly socket: net.Socket,
    private readonly recorder?: TranscriptRecorder,
  ) {
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        if (this.buffer.length < 4) break;
        const length = this.buffer.readUInt32BE(0);
        if (this.buffer.length < 4 + length) break;
        const frame: unknown = JSON.parse(this.buffer.subarray(4, 4 + length).toString("utf8"));
        this.buffer = this.buffer.subarray(4 + length);
        this.recorder?.record("recv", frame);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(frame);
        else this.ready.push(frame);
      }
    });
    const fail = (error: Error) => {
      this.closedError = error;
      for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    };
    socket.on("error", (error) => fail(new Error(`raw session socket error: ${error.message}`)));
    socket.on("close", () => fail(new Error("raw session closed")));
  }

  static connect(socketPath: string, recorder?: TranscriptRecorder): Promise<RawSession> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(socketPath);
      socket.once("connect", () => resolve(new RawSession(socket, recorder)));
      socket.once("error", (error) => reject(new Error(`raw connect failed: ${error.message}`)));
    });
  }

  send(frame: unknown): void {
    this.recorder?.record("send", frame);
    const body = Buffer.from(JSON.stringify(frame), "utf8");
    const prefix = Buffer.allocUnsafe(4);
    prefix.writeUInt32BE(body.length, 0);
    this.socket.write(Buffer.concat([prefix, body]));
  }

  recv(timeoutMs = 5_000): Promise<unknown> {
    const queued = this.ready.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      const timer = setTimeout(() => {
        const at = this.waiters.indexOf(waiter);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error(`no frame within ${timeoutMs} ms`));
      }, timeoutMs);
      waiter.resolve = (frame) => {
        clearTimeout(timer);
        resolve(frame);
      };
      waiter.reject = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.waiters.push(waiter);
    });
  }

  /** Sends a hello and returns the reply frame (accepted or refusal). */
  async hello(access: "read" | "read_write", extra: Record<string, unknown> = {}): Promise<unknown> {
    this.send({ hello: { protocol: 2, access, ...extra } });
    return this.recv();
  }

  close(): void {
    this.socket.destroy();
  }
}
