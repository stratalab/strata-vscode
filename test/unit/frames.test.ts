/**
 * Frame codec (AR-2.1): 4-byte BE length prefix, 64 MiB cap, arbitrary
 * fragmentation tolerance.
 */
import { describe, expect, it } from "vitest";
import {
  FRAME_CAP_BYTES,
  FrameCapExceededError,
  FrameDecoder,
  encodeFrame,
} from "../../src/wire/frames";

describe("frame codec", () => {
  it("round-trips a payload", () => {
    const decoder = new FrameDecoder();
    const frames = decoder.push(encodeFrame({ hello: { protocol: 2 } }));
    expect(frames).toEqual([{ hello: { protocol: 2 } }]);
    expect(decoder.pendingBytes).toBe(0);
  });

  it("reassembles frames split at every byte boundary", () => {
    const payload = { id: 7, payload: { type: "pong", data: { note: "torn frame" } } };
    const encoded = encodeFrame(payload);
    const decoder = new FrameDecoder();
    const collected: unknown[] = [];
    for (let i = 0; i < encoded.length; i++) {
      collected.push(...decoder.push(encoded.subarray(i, i + 1)));
    }
    expect(collected).toEqual([payload]);
  });

  it("yields multiple frames from one chunk, in order", () => {
    const chunk = Buffer.concat([encodeFrame({ n: 1 }), encodeFrame({ n: 2 }), encodeFrame({ n: 3 })]);
    expect(new FrameDecoder().push(chunk)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("enforces the 64 MiB cap in both directions", () => {
    const oversizedHeader = Buffer.alloc(4);
    oversizedHeader.writeUInt32BE(FRAME_CAP_BYTES + 1, 0);
    expect(() => new FrameDecoder().push(oversizedHeader)).toThrow(FrameCapExceededError);
    expect(() => encodeFrame({ blob: "x".repeat(FRAME_CAP_BYTES) })).toThrow(FrameCapExceededError);
  });
});
