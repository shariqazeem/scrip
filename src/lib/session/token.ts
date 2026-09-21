import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * THE SESSION COOKIE — `owner.expiry.hmac`, signed with a server secret.
 *
 * It carries an owner pubkey and nothing else, because that is all a session here IS: proof
 * that somebody demonstrated control of a wallet. No balance, no policy, no permission —
 * everything else is read from the chain under that pubkey at request time, so a stolen
 * cookie grants the ability to LOOK at a public book, never to move anything. Moving value
 * needs a transaction signature every time, which this cookie cannot produce.
 */
const SESSION_TTL_SECONDS = 30 * 24 * 3600;

/**
 * A missing secret fails toward NO PERSISTENT SESSION, never toward an unsigned cookie.
 *
 * In production an unset secret is a hard error, because the alternative is a cookie anyone
 * can forge. In development it becomes a per-process random value: sign-in works, and
 * sessions simply do not survive a restart — a small annoyance in exchange for never having a
 * shared default secret in a repo, which is how a dev convenience becomes a production hole.
 */
let devSecret: Buffer | null = null;
function secret(): Buffer {
  const fromEnv = process.env.SCRIP_SESSION_SECRET?.trim();
  if (fromEnv) return Buffer.from(fromEnv, "utf8");
  if (process.env.NODE_ENV === "production") {
    throw new Error("SCRIP_SESSION_SECRET must be set in production");
  }
  devSecret ??= randomBytes(32);
  return devSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueSessionToken(owner: string, now: number): string {
  const expiry = now + SESSION_TTL_SECONDS;
  const payload = `${owner}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the owner, or null. Never throws: a malformed cookie is simply not a session. */
export function readSessionToken(token: string | undefined, now: number): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [owner, expiryRaw, mac] = parts as [string, string, string];
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry <= now) return null;

  const expected = sign(`${owner}.${expiryRaw}`);
  // Constant-time, so the comparison cannot be used to discover a valid signature a byte at
  // a time.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return owner;
}

export const SESSION_COOKIE = "scrip_session";
export const NONCE_COOKIE = "scrip_nonce";
export { SESSION_TTL_SECONDS };
