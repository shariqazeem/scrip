import { NextResponse } from "next/server";
import { NONCE_TTL_SECONDS, newNonce } from "@/lib/session/message";
import { NONCE_COOKIE } from "@/lib/session/token";

export const dynamic = "force-dynamic";

/**
 * Issue a single-use nonce and remember it in an httpOnly cookie.
 *
 * The nonce is what makes a signature usable exactly once, here. Without it, a signature
 * captured anywhere — a phishing page, a logged request, an old session — stays valid
 * forever, and "prove you own this wallet" becomes "show me any proof you ever made".
 */
export async function GET() {
  const nonce = newNonce();
  const res = NextResponse.json({ nonce, issuedAt: new Date().toISOString() });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: NONCE_TTL_SECONDS,
  });
  return res;
}
