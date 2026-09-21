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

/**
 * THE SHAPE IS NOT OURS TO CHOOSE. Sign In With Solana follows EIP-4361: the domain line,
 * the address, a blank line, a statement of EXACTLY ONE LINE, a blank line, then the
 * labelled fields. A wallet that recognises the shape renders it as a sign-in; one that
 * cannot parse it refuses to show it at all.
 *
 * This statement used to be wrapped across two lines, which is not a legal statement. It
 * went unnoticed while the site ran on an sslip.io host, because the domain line did not
 * match the origin and Phantom fell back to displaying it as plain text. The moment the
 * site moved to its own domain and the two matched, Phantom parsed it properly and refused:
 * "The app's signature request cannot be shown due to invalid formatting." Fixing the
 * domain is what surfaced the bug, not what caused it.
 */
export function signInMessage(pubkey: string, nonce: string, issuedAt: string): string {
  const url = siteUrl();
  const domain = new URL(url).host;
  return [
    `${domain} wants you to sign in with your Solana account:`,
    pubkey,
    "",
    // One line. The wording still has to do its job in the most alarming moment in the
    // product, so it says what this is and what it is not, in the popup itself.
    "Open your Scrip register. This signature proves the wallet is yours. It costs nothing, moves nothing, and authorises no transaction.",
    "",
    `URI: ${url}`,
    "Version: 1",
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
