import { siteUrl } from "@/lib/site";

/**
 * THE SIGN-IN MESSAGE — built from a template on both sides, never trusted from the client.
 *
 * The server rebuilds the exact string from (pubkey, nonce, issuedAt) and compares it
 * byte-for-byte with what was signed. Verifying a signature over a message the CLIENT chose
 * proves only that the wallet signed something; it does not prove it agreed to this. That gap
 * is how a signature gathered by one site gets replayed at another.
 *
 * The wording matters as much as the crypto. A wallet popup is the most alarming moment in
 * the product, and the text in it is the only thing standing between a person and the
 * reasonable fear that they are authorising a transfer. So it says, in the popup itself, that
 * this costs nothing, moves nothing and authorises no transaction — which is true, because a
 * signed message is not a transaction.
 */
export const NONCE_TTL_SECONDS = 10 * 60;

export function signInMessage(pubkey: string, nonce: string, issuedAt: string): string {
  const url = siteUrl();
  const domain = new URL(url).host;
  return [
    `${domain} wants you to sign in with your Solana account:`,
    pubkey,
    "",
    "Open your Scrip book. This signature proves the wallet is yours. It costs nothing,",
    "moves nothing, and authorises no transaction.",
    "",
    `URI: ${url}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/** A nonce is 128 bits of hex — enough that a replay needs the real one, not a guess. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isFreshIssuedAt(issuedAt: string, now: number): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  const age = now - Math.floor(t / 1000);
  // A minute of tolerance for a clock that runs fast; a signature from ten minutes ago is
  // past its nonce's life anyway.
  return age >= -60 && age <= NONCE_TTL_SECONDS;
}
