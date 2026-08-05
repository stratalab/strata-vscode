/**
 * The wire byte boundary (AR-1.7): every `Bytes` field on the wire is a
 * standard base64 string. This brand makes hand-encoded keys a type error —
 * the only ways to produce a WireBase64 are the helpers below.
 */

declare const wireBase64Brand: unique symbol;

/** A base64-encoded binary payload as it travels on the wire. */
export type WireBase64 = string & { readonly [wireBase64Brand]: true };

/** Standard base64 (RFC 4648, with padding), the executor's encoding. */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Encodes raw bytes for the wire. */
export function encodeBytes(data: Uint8Array): WireBase64 {
  return Buffer.from(data).toString("base64") as WireBase64;
}

/** Decodes a wire value back to raw bytes. */
export function decodeBytes(value: WireBase64): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/** Encodes a UTF-8 string (e.g. user-typed key text) for the wire. */
export function encodeUtf8(text: string): WireBase64 {
  return Buffer.from(text, "utf8").toString("base64") as WireBase64;
}

/**
 * Validating cast for base64 arriving from outside the type system
 * (wire responses, fixtures, user-pasted raw JSON). Throws on non-canonical
 * input rather than letting a mis-encoded value masquerade as bytes.
 */
export function asWireBase64(value: string): WireBase64 {
  if (!BASE64_RE.test(value)) {
    throw new Error(`not canonical standard base64: ${JSON.stringify(value)}`);
  }
  return value as WireBase64;
}
