/**
 * Wire framing (AR-2.1): 4-byte big-endian length prefix + UTF-8 JSON
 * payload, 64 MiB frame cap, as landed in strata-core's executor IPC.
 */

export const FRAME_CAP_BYTES = 64 * 1024 * 1024;
const LENGTH_PREFIX_BYTES = 4;

export class FrameCapExceededError extends Error {
  constructor(size: number) {
    super(`frame of ${size} bytes exceeds the ${FRAME_CAP_BYTES}-byte wire cap`);
    this.name = "FrameCapExceededError";
  }
}

/** Encodes one JSON-serializable value as a length-prefixed frame. */
export function encodeFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.length > FRAME_CAP_BYTES) throw new FrameCapExceededError(body.length);
  const frame = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, LENGTH_PREFIX_BYTES);
  return frame;
}

/**
 * Incremental frame decoder: feed it socket chunks in any fragmentation, it
 * yields complete decoded JSON payloads in order. A frame over the cap or
 * non-JSON payload throws — framing errors are protocol-fatal (AR-2.7:
 * connection-level, not request-level).
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const frames: unknown[] = [];
    for (;;) {
      if (this.buffer.length < LENGTH_PREFIX_BYTES) break;
      const length = this.buffer.readUInt32BE(0);
      if (length > FRAME_CAP_BYTES) throw new FrameCapExceededError(length);
      if (this.buffer.length < LENGTH_PREFIX_BYTES + length) break;
      const body = this.buffer.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length);
      frames.push(JSON.parse(body.toString("utf8")));
      this.buffer = this.buffer.subarray(LENGTH_PREFIX_BYTES + length);
    }
    return frames;
  }

  /** Bytes of any incomplete trailing frame (diagnostics on close). */
  get pendingBytes(): number {
    return this.buffer.length;
  }
}
