"use client";

import { useEffect, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import { StandardConnect } from "@wallet-standard/features";
import { type Sendable, isSolanaWallet } from "@/lib/wallet/client";

/**
 * THE WALLETS IN THIS BROWSER, AND THE WAY IN WHEN THERE ARE NONE.
 *
 * A judge opening scrip.work in Safari on a phone has no wallet in that browser; their
 * wallet is an app. So the empty state is not "install a wallet" but one tap that reopens
 * this page inside the wallet's own browser, where the save works.
 */
export function useWallets(): readonly Sendable[] {
  const [wallets, setWallets] = useState<readonly Sendable[]>([]);
  useEffect(() => {
    const registry = getWallets();
    const refresh = () => setWallets(registry.get().filter(isSolanaWallet));
    refresh();
    const off1 = registry.on("register", refresh);
    const off2 = registry.on("unregister", refresh);
    return () => {
      off1();
      off2();
    };
  }, []);
  return wallets;
}

const REMEMBERED = "scrip:wallet";

export function rememberWallet(name: string | null): void {
  try {
    if (name) localStorage.setItem(REMEMBERED, name);
    else localStorage.removeItem(REMEMBERED);
  } catch {
    // A private window: the next visit asks again, which is fine.
  }
}

export function rememberedWallet(): string | null {
  try {
    return localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

/** Reconnect a wallet that already trusts this site, without a popup. Null when it does not. */
export async function silentConnect(wallet: Sendable): Promise<string | null> {
  try {
    const { accounts } = await wallet.features[StandardConnect].connect({ silent: true });
    return accounts.find((a) => a.chains.some((c) => c.startsWith("solana:")))?.address ?? null;
  } catch {
    return null;
  }
}

export function isPhone(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Reopen this page inside a wallet app's own browser. */
export function walletBrowseLinks(url: string): ReadonlyArray<{ name: string; href: string }> {
  const u = encodeURIComponent(url);
  const ref = encodeURIComponent(new URL(url).origin);
  return [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${u}?ref=${ref}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${u}?ref=${ref}` },
    { name: "Backpack", href: `https://backpack.app/ul/v1/browse/${u}?ref=${ref}` },
  ];
}
