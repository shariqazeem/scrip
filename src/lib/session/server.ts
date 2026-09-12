import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE, readSessionToken } from "./token";

/**
 * THE ONE PLACE BOTH DOORS RESOLVE TO AN OWNER.
 *
 * A browser wallet and an email sign-in that mints an embedded wallet produce the same thing:
 * a Solana pubkey somebody has demonstrated control of. Every surface asks this, so adding the
 * second door changes the route that ISSUES the cookie and changes nothing that reads it.
 *
 * Returns null for "nobody is signed in". A caller that needs to distinguish "still asking"
 * does not exist on the server — the answer is already here by the time a page renders, which
 * is one of the reasons the session lives in a cookie rather than in client state.
 */
export async function currentOwner(): Promise<string | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value, Math.floor(Date.now() / 1000));
}
