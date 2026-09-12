import { customAlphabet } from "nanoid";

/**
 * Ids are lowercase base36 — url-safe, case-insensitive, and readable aloud. 21 chars at
 * this alphabet is ~108 bits, which is collision-free at any volume this product reaches.
 */
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const gen = customAlphabet(alphabet, 21);

export function newId(prefix: string): string {
  return `${prefix}_${gen()}`;
}

/** Unix seconds — the timestamp unit across the whole schema. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
