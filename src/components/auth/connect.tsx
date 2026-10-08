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
import { signInWith } from "@/lib/session/sign-in";
import { isPhone, walletBrowseLinks } from "@/components/save/wallets";

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
      // One prompt where the wallet can sign in by itself; connect, then sign, where it cannot.
      const signed = await signInWith(wallet, { session: "always" });
      setBusy(null);
      if (!signed.ok) {
        // A closed popup is the common case and says nothing.
        setWhy(signed.why || null);
        return;
      }
      if (!signed.value.session) {
        setWhy("That signature could not be verified. Nothing was changed.");
        return;
      }
      router.refresh();
    },
    [router],
  );

  if (wallets.length === 0) return <NoWalletHere />;

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

/**
 * NO WALLET IN THIS BROWSER. On a phone that almost always means Safari or Chrome, while the
 * wallet is an app: one tap reopens this same page inside the wallet's own browser, where
 * signing works. On a computer it means no extension yet. Decided after mount, because the
 * server cannot know which device it is rendering for.
 */
function NoWalletHere() {
  const [phoneAt, setPhoneAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPhoneAt(isPhone() ? window.location.href : null);
    setReady(true);
  }, []);
  if (!ready) return <div className="sp-doors" aria-busy="true" />;
  if (phoneAt) {
    return (
      <div className="sp-doors">
        <p className="sp-doors-lead">Open Scrip in your wallet app</p>
        {walletBrowseLinks(phoneAt).map((l) => (
          <a key={l.name} href={l.href} className="sp-action sp-door">
            <WalletIcon size={16} strokeWidth={2} aria-hidden />
            Open in {l.name}
          </a>
        ))}
        <p className="sp-doors-note">This page opens inside the wallet, where signing in takes one tap. Nothing moves.</p>
      </div>
    );
  }
  return (
    <div className="sp-doors">
      <p className="sp-doors-lead">No Solana wallet in this browser yet</p>
      <p className="sp-doors-note">
        Install <a href="https://phantom.app">Phantom</a>, <a href="https://solflare.com">Solflare</a> or <a href="https://backpack.app">Backpack</a>, then
        come back to this page. Scrip never holds your money: it works with the wallet you already have.
      </p>
    </div>
  );
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
