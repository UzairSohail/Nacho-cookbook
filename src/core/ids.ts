/**
 * Ids for rows created on a device. The database expects UUIDs, and rows made
 * offline need an id before the server sees them.
 */

function hex(bytes: number[]): string {
  const h = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** A random version 4 UUID. */
export function uuid(): string {
  const bytes: number[] = [];
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoObj?.getRandomValues) {
    bytes.push(...cryptoObj.getRandomValues(new Uint8Array(16)));
  } else {
    for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return hex(bytes);
}

/**
 * The same UUID every time for the same parts. Used for rows that are "the one
 * for this thing", like the dinner slot on a given day: if two people fill it
 * while offline, both write the same row and the last edit wins, instead of
 * clashing.
 */
export function stableUuid(...parts: string[]): string {
  const input = parts.join('\u0000');
  // Four independent 32-bit FNV-1a hashes give 128 bits.
  const bytes: number[] = [];
  for (let seed = 0; seed < 4; seed++) {
    let h = (0x811c9dc5 ^ (seed * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Extra mixing so similar inputs spread out.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    bytes.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return hex(bytes);
}
