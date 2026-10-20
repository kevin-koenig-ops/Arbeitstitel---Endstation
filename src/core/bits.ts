// Bitfelder kompakt als Base64-Text speichern (ohne Browser- oder Node-Funktionen).

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHA].map((c, i) => [c, i]));

export function encodeBits(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHA[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHA[n & 63] : '=';
  }
  return out;
}

export function decodeBits(text: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i < text.length && o < length; i += 4) {
    const n =
      ((LOOKUP.get(text[i]) ?? 0) << 18) | ((LOOKUP.get(text[i + 1]) ?? 0) << 12) | ((LOOKUP.get(text[i + 2]) ?? 0) << 6) | (LOOKUP.get(text[i + 3]) ?? 0);
    out[o++] = (n >> 16) & 255;
    if (o < length && text[i + 2] !== '=') out[o++] = (n >> 8) & 255;
    if (o < length && text[i + 3] !== '=') out[o++] = n & 255;
  }
  return out;
}

export function popcount(bytes: Uint8Array): number {
  let n = 0;
  for (let b of bytes) {
    while (b) {
      n += b & 1;
      b >>= 1;
    }
  }
  return n;
}
