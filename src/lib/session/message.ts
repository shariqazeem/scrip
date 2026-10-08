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
/**
 * The fields a wallet's own sign-in (`solana:signIn`) is given, so it writes the same message
 * `signInMessage` builds. One line of statement. The wording still has to do its job in the
 * most alarming moment in the product, so it says what this is and what it is not.
 */
export function signInFields(): { domain: string; statement: string; uri: string; version: "1" } {
  const uri = siteUrl();
  return {
    domain: new URL(uri).host,
    statement: "Open your Scrip savings. This signature proves the wallet is yours. It costs nothing, moves nothing, and authorises no transaction.",
    uri,
    version: "1",
  };
}

export function signInMessage(pubkey: string, nonce: string, issuedAt: string): string {
  const f = signInFields();
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    pubkey,
    "",
    f.statement,
    "",
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/**
 * A SIGN-IN THE WALLET WROTE ITSELF. With `solana:signIn` one prompt connects and signs in,
 * and the wallet composes the message from the fields above. A wallet may add a line of its
 * own — a chain id — so this reads the message line by line instead of comparing bytes: our
 * domain and the claimed address on top, our statement, and among the fields exactly our URI,
 * version, nonce and issued-at, nothing else but a Solana chain id. The signature is then
 * checked over the exact bytes the wallet signed.
 */
export function signInTextMatches(text: string, expect: { pubkey: string; nonce: string; issuedAt: string }): boolean {
  const ours = signInMessage(expect.pubkey, expect.nonce, expect.issuedAt);
  if (text === ours) return true;
  const want = ours.split("\n");
  const got = text.split("\n");
  if (got.length < 6) return false;
  for (let i = 0; i < 5; i += 1) if (got[i] !== want[i]) return false;
  const wanted = new Map(want.slice(5).map((line) => [line.slice(0, line.indexOf(":")), line] as const));
  const seen = new Set<string>();
  for (const line of got.slice(5)) {
    const key = line.slice(0, line.indexOf(":"));
    if (key === "Chain ID") {
      if (!/^Chain ID: (solana:)?(mainnet|mainnet-beta|devnet|testnet|localnet)$/.test(line)) return false;
      continue;
    }
    if (seen.has(key) || wanted.get(key) !== line) return false;
    seen.add(key);
  }
  return seen.size === wanted.size;
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
