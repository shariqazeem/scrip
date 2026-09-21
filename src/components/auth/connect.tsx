"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import {
  SolanaSignMessage,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import { Wallet as WalletIcon } from "lucide-react";
import { signInMessage } from "@/lib/session/message";

/**
 * THE WALLET DOOR — Wallet Standard directly, with no adapter UI package.
 *
 * Every Solana wallet worth supporting registers itself through the Wallet Standard, so the
 * list below is discovered from the browser rather than maintained here: no registry of
 * wallet names to fall out of date, and a wallet released next month appears without a
 * release from us.
 *
 * The adapter ecosystem's ready-made modal was deliberately not used. It ships its own
 * stylesheet with its own palette, which would be the second place a colour is defined in a
 * product whose whole design rule is that there is only one — and the modal is four lines of
 * markup. Sage learned that lesson the expensive way, with five stylesheets and a hundred
 * raw colour literals to unpick.
 */
type Connectable = Wallet & { features: StandardConnectFeature & SolanaSignMessageFeature };

function isConnectable(w: Wallet): w is Connectable {
  return (
    StandardConnect in w.features &&
    SolanaSignMessage in w.features &&
    // A wallet with no Solana chains is a wallet for some other chain that happens to be
    // installed. Offering it is offering a door that opens onto a wall.
    w.chains.some((c) => c.startsWith("solana:"))
  );
}

export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [wallets, setWallets] = useState<readonly Connectable[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    const registry = getWallets();
    const refresh = () => setWallets(registry.get().filter(isConnectable));
    refresh();
    // Wallets register asynchronously, and some register after first paint. Without these
    // listeners the list is whatever happened to exist at mount, which on a cold load is
    // often nothing.
    const offRegister = registry.on("register", refresh);
    const offUnregister = registry.on("unregister", refresh);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  const connect = useCallback(
    async (wallet: Connectable) => {
      setBusy(wallet.name);
      setWhy(null);
      try {
        const connected = await wallet.features[StandardConnect].connect();
        const account = connected.accounts.find((a) => a.chains.some((c) => c.startsWith("solana:")));
        if (!account) {
          setWhy(`${wallet.name} did not offer a Solana account.`);
          return;
        }

        const res = await fetch("/api/session/nonce", { cache: "no-store" });
        if (!res.ok) {
          setWhy("Could not start a sign-in. Try again in a moment.");
          return;
        }
        const { nonce, issuedAt } = (await res.json()) as { nonce: string; issuedAt: string };

        // The SAME template the server rebuilds. If these ever drift, every sign-in fails
        // closed rather than open — the server compares byte-for-byte.
        const message = new TextEncoder().encode(signInMessage(account.address, nonce, issuedAt));
        const [signed] = await wallet.features[SolanaSignMessage].signMessage({ account, message });
        if (!signed) {
          setWhy("The wallet returned no signature.");
          return;
        }

        const post = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pubkey: account.address,
            signature: toBase64(signed.signature),
            nonce,
            issuedAt,
          }),
        });
        if (!post.ok) {
          setWhy("That signature could not be verified. Nothing was changed.");
          return;
        }
        router.refresh();
      } catch (err) {
        // A user closing the popup is the common case and is not an error worth shouting
        // about. Anything else says what happened in a sentence.
        const msg = err instanceof Error ? err.message : String(err);
        setWhy(/reject|denied|cancel|closed/i.test(msg) ? null : msg);
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  if (wallets.length === 0) {
    return (
      <div className="sp-doors">
        <p className="sp-doors-note">
          No Solana wallet is installed in this browser. Install one — Phantom, Solflare and
          Backpack all work — or open Scrip in a wallet&rsquo;s own browser.
        </p>
      </div>
    );
  }

  return (
    <div className="sp-doors">
      {wallets.map((w) => (
        <button
          key={w.name}
          type="button"
          className={`sp-action${compact ? "" : " is-primary"} sp-door`}
          onClick={() => void connect(w)}
          disabled={busy !== null}
        >
          {w.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={w.icon} alt="" width={18} height={18} className="sp-door-icon" />
          ) : (
            <WalletIcon size={16} strokeWidth={2} aria-hidden />
          )}
          {busy === w.name ? `Waiting for ${w.name}…` : w.name}
        </button>
      ))}
      {why ? <p className="sp-doors-error">{why}</p> : null}
      <p className="sp-doors-note">
        Signing in costs nothing and moves nothing. It is a signature, not a transaction.
      </p>
    </div>
  );
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Sign out. Clears the cookie and re-renders whatever was reading it. */
export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="sp-action"
      onClick={() => {
        void fetch("/api/session", { method: "DELETE" }).then(() => router.refresh());
      }}
    >
      Sign out
    </button>
  );
}
