"use client";

/**
 * THE IDENTITY SEAM.
 *
 * Both sign-in doors — a browser wallet and a Privy email that mints an embedded Solana
 * wallet — resolve to the same thing: an owner pubkey. Every surface asks this hook and
 * nothing else, so when the doors land, one module changes and no page does.
 *
 * `loading` is a distinct state from `owner: null` on purpose. "Still asking" is not
 * "signed out", and rendering them identically is how a signed-in owner sees "Sign in" on
 * their own book for the half-second before the session answers. Nothing is claimed until
 * the answer arrives.
 */
export type Session = {
  /** true while the session is still being resolved. Never render a verdict during this. */
  loading: boolean;
  /** base58 owner pubkey, or null when nobody is signed in. */
  owner: string | null;
};

const SIGNED_OUT: Session = { loading: false, owner: null };

export function useSession(): Session {
  // No door is wired yet, and this says so rather than pretending otherwise. When the
  // wallet and Privy doors land they replace this body; the type is the contract.
  return SIGNED_OUT;
}
