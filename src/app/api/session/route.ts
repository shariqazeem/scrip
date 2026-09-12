import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { isFreshIssuedAt, signInMessage } from "@/lib/session/message";
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  issueSessionToken,
} from "@/lib/session/token";

export const dynamic = "force-dynamic";

/**
 * SIGN IN WITH A SOLANA WALLET.
 *
 * The server REBUILDS the message it expects from (pubkey, nonce, issuedAt) and compares it
 * to what was signed. Verifying a signature over a message the client supplied would prove
 * only that the wallet signed something — not that it agreed to this, at this site, once.
 * That gap is how a signature collected somewhere else gets replayed here.
 *
 * Four things must all hold: the nonce matches the httpOnly cookie we issued, the timestamp
 * is inside its window, the rebuilt message is byte-identical to the signed one, and the
 * signature verifies against the claimed pubkey. Any one failing is the same answer — no
 * session — with no detail about which, because a login oracle is a gift to whoever is
 * probing it.
 */
export async function POST(req: NextRequest) {
  const nonceCookie = req.cookies.get(NONCE_COOKIE)?.value;
  if (!nonceCookie) return deny();

  let body: { pubkey?: unknown; signature?: unknown; nonce?: unknown; issuedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return deny();
  }
  const { pubkey, signature, nonce, issuedAt } = body;
  if (
    typeof pubkey !== "string" ||
    typeof signature !== "string" ||
    typeof nonce !== "string" ||
    typeof issuedAt !== "string"
  ) {
    return deny();
  }

  // Single use, and ours. A nonce that does not match the cookie is a signature made for
  // some other exchange.
  if (nonce !== nonceCookie) return deny();
  if (!isFreshIssuedAt(issuedAt, Math.floor(Date.now() / 1000))) return deny();

  let owner: PublicKey;
  try {
    owner = new PublicKey(pubkey);
  } catch {
    return deny();
  }
  // A pubkey that is not on the ed25519 curve is a PDA — a program-derived address that no
  // private key exists for. It can never have produced this signature, and accepting one
  // would mean accepting a signature nobody could have made.
  if (!PublicKey.isOnCurve(owner.toBytes())) return deny();

  let sig: Uint8Array;
  try {
    sig = Uint8Array.from(Buffer.from(signature, "base64"));
  } catch {
    return deny();
  }
  if (sig.length !== 64) return deny();

  const expected = new TextEncoder().encode(signInMessage(pubkey, nonce, issuedAt));
  let valid = false;
  try {
    valid = ed25519.verify(sig, expected, owner.toBytes());
  } catch {
    valid = false;
  }
  if (!valid) return deny();

  const now = Math.floor(Date.now() / 1000);
  const res = NextResponse.json({ owner: pubkey });
  res.cookies.set(SESSION_COOKIE, issueSessionToken(pubkey, now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  // The nonce is spent either way.
  res.cookies.set(NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ owner: null });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function deny() {
  // One answer for every failure. Telling a caller WHICH check failed turns this route into
  // an oracle for whoever is probing it.
  return NextResponse.json({ error: "Could not verify that signature." }, { status: 401 });
}
