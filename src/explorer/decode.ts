/**
 * Byte rendering for previews and the inspector (F4.1 discipline, applied
 * early): values are bytes — auto-detect text/JSON but never guess silently.
 * Every rendering states which form it is.
 */
import { decodeBytes, type WireBase64 } from "../wire/bytes";

export type DecodedForm = "text" | "json" | "binary";

export interface DecodedValue {
  form: DecodedForm;
  /** Printable rendering in the detected form (hex preview for binary). */
  display: string;
  byteLength: number;
}

const PREVIEW_MAX = 80;

export function decodeValue(value: WireBase64): DecodedValue {
  const bytes = decodeBytes(value);
  const text = tryUtf8(bytes);
  if (text === null) {
    return { form: "binary", display: hexPreview(bytes, 32), byteLength: bytes.length };
  }
  try {
    JSON.parse(text);
    return { form: "json", display: text, byteLength: bytes.length };
  } catch {
    return { form: "text", display: text, byteLength: bytes.length };
  }
}

/** One-line, length-capped preview for tree rows. */
export function previewValue(value: WireBase64): string {
  const decoded = decodeValue(value);
  const oneLine = decoded.display.replace(/\s+/g, " ");
  const clipped = oneLine.length > PREVIEW_MAX ? `${oneLine.slice(0, PREVIEW_MAX)}…` : oneLine;
  return decoded.form === "binary" ? `(${decoded.byteLength} bytes) ${clipped}` : clipped;
}

/** A key rendered for labels: UTF-8 when printable, hex otherwise — stated. */
export function keyLabel(key: WireBase64): string {
  const bytes = decodeBytes(key);
  const text = tryUtf8(bytes);
  return text ?? `0x${hexPreview(bytes, 16)}`;
}

/** UTF-8 text of the key when printable — the CLI-copy form (AR-1.7). */
export function keyText(key: WireBase64): string | null {
  return tryUtf8(decodeBytes(key));
}

function tryUtf8(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Control characters (except tab/newline/CR) mean "not really text".
     
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? null : text;
  } catch {
    return null;
  }
}

function hexPreview(bytes: Uint8Array, max: number): string {
  const slice = Buffer.from(bytes.subarray(0, max)).toString("hex");
  return bytes.length > max ? `${slice}…` : slice;
}
