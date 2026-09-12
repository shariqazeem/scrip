"use client";

import { useEffect, useState } from "react";

/**
 * THE IDENTITY SEAM FOR THE CHROME.
 *
 * Both sign-in doors — a browser wallet, and an email sign-in that mints an embedded Solana
 * wallet — resolve to the same thing: an owner pubkey, carried in one httpOnly cookie. This
 * hook exists only for components that live in the ROOT layout, where reading the cookie
 * directly would make every page dynamic, landing included. Everything that needs the owner
 * for DATA reads it on the server via `currentOwner()`.
 *
 * `loading` is a distinct state from `owner: null` on purpose. "Still asking" is not "signed
 * out", and rendering them identically is how a signed-in owner sees "Sign in" on their own
 * book for the half-second before the answer arrives. Nothing is claimed until it does.
 */
export type Session = {
  readonly loading: boolean;
  readonly owner: string | null;
};

export function useSession(): Session {
  const [session, setSession] = useState<Session>({ loading: true, owner: null });

  useEffect(() => {
    let alive = true;
    fetch("/api/session/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { owner: null }))
      .then((d: { owner: string | null }) => {
        if (alive) setSession({ loading: false, owner: d.owner ?? null });
      })
      // A failed fetch means we do not know, and "we do not know" resolves to signed out
      // rather than to a spinner that never ends.
      .catch(() => alive && setSession({ loading: false, owner: null }));
    return () => {
      alive = false;
    };
  }, []);

  return session;
}
