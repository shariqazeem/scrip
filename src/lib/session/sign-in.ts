"use client";

import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import {
  SolanaSignIn,
  type SolanaSignInFeature,
  SolanaSignMessage,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import { type Outcome, held, ok } from "@/lib/outcome";
import { toBase64, userFacing } from "@/lib/wallet/client";
import { signInMessage } from "./message";

export type SignedIn = {
  readonly account: WalletAccount;
  readonly address: string;
  /** Whether the server issued a session: Your savings opens without asking again. */
  readonly session: boolean;
};

type Nonce = { nonce: string; issuedAt: string; domain: string; statement: string; uri: string; version: "1" };

/**
 * ONE PROMPT TO BE IN. A wallet that offers `solana:signIn` connects and signs in with a single
 * approval, and the server checks the message it wrote line by line (`signInTextMatches`).
 * A wallet without it is connected, and then — only when a session is the point, as with the
 * nav's "Sign in" — asked to sign the same message in a second prompt. Starting to save never
 * needs that second prompt: what it signs is a transaction only that wallet can sign.
 */
export async function signInWith(wallet: Wallet, opts: { session: "always" | "when-free" }): Promise<Outcome<SignedIn>> {
  const f = wallet.features as Partial<StandardConnectFeature & SolanaSignInFeature & SolanaSignMessageFeature>;
  try {
    if (f[SolanaSignIn]) {
      const n = await nonce();
      if (!n) return held("Could not start a sign-in. Try again in a moment.");
      const [out] = await f[SolanaSignIn].signIn({ domain: n.domain, statement: n.statement, uri: n.uri, version: n.version, nonce: n.nonce, issuedAt: n.issuedAt });
      if (!out) return held("The wallet returned no sign-in.");
      const session = await post({
        pubkey: out.account.address,
        signature: toBase64(out.signature),
        nonce: n.nonce,
        issuedAt: n.issuedAt,
        signedMessage: toBase64(out.signedMessage),
      });
      return ok({ account: out.account, address: out.account.address, session });
    }
    if (!f[StandardConnect]) return held(`${wallet.name} cannot connect to a site.`);
    const { accounts } = await f[StandardConnect].connect();
    const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:")));
    if (!account) return held(`${wallet.name} did not offer a Solana account.`);
    if (opts.session === "when-free" || !f[SolanaSignMessage]) return ok({ account, address: account.address, session: false });
    const n = await nonce();
    if (!n) return held("Could not start a sign-in. Try again in a moment.");
    const message = new TextEncoder().encode(signInMessage(account.address, n.nonce, n.issuedAt));
    const [signed] = await f[SolanaSignMessage].signMessage({ account, message });
    if (!signed) return held("The wallet returned no signature.");
    const session = await post({ pubkey: account.address, signature: toBase64(signed.signature), nonce: n.nonce, issuedAt: n.issuedAt });
    if (!session) return held("That signature could not be verified. Nothing was changed.");
    return ok({ account, address: account.address, session });
  } catch (err) {
    return held(userFacing(err));
  }
}

async function nonce(): Promise<Nonce | null> {
  const res = await fetch("/api/session/nonce", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as Nonce;
}

async function post(body: Record<string, string>): Promise<boolean> {
  const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return Boolean(res?.ok);
}
