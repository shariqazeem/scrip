"use client";

import { useEffect, useState } from "react";
import type { WalletAccount } from "@wallet-standard/base";
import { type Keypair, VersionedTransaction } from "@solana/web3.js";
import { rememberWallet, rememberedWallet, silentConnect, useWallets } from "@/components/save/wallets";
import { type Sendable, connect, fromBase64, signAll, toBase64 } from "@/lib/wallet/client";

/**
 * A WALLET FOR SCRIP CURVE — the wallets in this browser, the one that already trusts scrip.work
 * reconnected without a popup, and the way a launch or a trade is signed and sent: every
 * transaction in ONE wallet prompt, the new token's own key signing after the wallet (so the
 * wallet sees the transaction first and can add its checks), then each relayed in order.
 */
export type Connected = { wallet: Sendable; account: WalletAccount };

export function useCurveWallet(): { wallets: readonly Sendable[]; connected: Connected | null; choose: (w: Sendable) => Promise<Connected | string> } {
  const wallets = useWallets();
  const [connected, setConnected] = useState<Connected | null>(null);
  useEffect(() => {
    if (connected) return;
    const name = rememberedWallet();
    const w = wallets.find((x) => x.name === name);
    if (!w) return;
    let live = true;
    void silentConnect(w).then((address) => {
      const account = address ? w.accounts.find((a) => a.address === address) : undefined;
      if (live && account) setConnected({ wallet: w, account });
    });
    return () => {
      live = false;
    };
  }, [wallets, connected]);
  /** Connect a wallet: the connection, or why not ("" when the person closed the popup). */
  const choose = async (w: Sendable): Promise<Connected | string> => {
    const a = await connect(w);
    if (!a.ok) return a.why;
    rememberWallet(w.name);
    const c = { wallet: w, account: a.value };
    setConnected(c);
    return c;
  };
  return { wallets, connected, choose };
}

/**
 * Sign every transaction in one prompt, add each `extra` key's signature where it is required (a
 * launch's mint; a graduation's two position NFT mints), send each in order.
 */
export async function signAndRelay(c: Connected, cluster: string, transactions: readonly string[], extra?: Keypair | readonly Keypair[]): Promise<{ ok: true; signatures: string[] } | { ok: false; why: string; signatures: string[] }> {
  const signed = await signAll(c.wallet, c.account, transactions.map(fromBase64), cluster);
  if (!signed.ok) return { ok: false, why: signed.why, signatures: [] };
  const extras = extra ? (Array.isArray(extra) ? extra : [extra]) : [];
  const signatures: string[] = [];
  for (const bytes of signed.value) {
    const tx = VersionedTransaction.deserialize(bytes);
    const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
    const mine = extras.filter((k) => signers.some((s) => s.equals(k.publicKey)));
    if (mine.length > 0) tx.sign(mine);
    let res: Response;
    try {
      res = await fetch("/api/curve/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionBase64: toBase64(tx.serialize()) }) });
    } catch {
      return { ok: false, why: "The network dropped the request. Nothing else was sent.", signatures };
    }
    const j = (await res.json().catch(() => ({}))) as { signature?: string; error?: string };
    if (!res.ok || !j.signature) return { ok: false, why: j.error ?? "It was not sent.", signatures };
    signatures.push(j.signature);
  }
  return { ok: true, signatures };
}
