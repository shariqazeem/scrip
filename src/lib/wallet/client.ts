"use client";

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * THE WALLET, THROUGH THE WALLET STANDARD — no adapter UI, no second palette.
 *
 * Every Solana wallet worth supporting registers itself through the standard, so the list
 * is discovered from the browser. What signs is the wallet, at the last moment, holding the
 * only key involved; nothing here can sign.
 */
export type Sendable = Wallet & {
  features: StandardConnectFeature & Partial<SolanaSignAndSendTransactionFeature & SolanaSignTransactionFeature>;
};

export function isSolanaWallet(w: Wallet): w is Sendable {
  return StandardConnect in w.features && w.chains.some((c) => c.startsWith("solana:"));
}

export function solanaWallets(): readonly Sendable[] {
  return getWallets().get().filter(isSolanaWallet);
}

/** The connected account for a signed-in owner, in whichever wallet holds it. */
export function findAccount(owner: string): { wallet: Sendable; account: WalletAccount } | null {
  for (const w of solanaWallets()) {
    const account = w.accounts.find((a) => a.address === owner);
    if (account) return { wallet: w, account };
  }
  return null;
}

export function chainId(cluster: string): `solana:${string}` {
  return `solana:${cluster === "mainnet-beta" ? "mainnet" : cluster}` as `solana:${string}`;
}

/** Connect a wallet and return its first Solana account. */
export async function connect(wallet: Sendable): Promise<Outcome<WalletAccount>> {
  try {
    const { accounts } = await wallet.features[StandardConnect].connect();
    const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:")));
    if (!account) return held(`${wallet.name} did not offer a Solana account.`);
    return ok(account);
  } catch (err) {
    return held(userFacing(err));
  }
}

/** Sign and send a serialized transaction (legacy or versioned). Returns the signature, base58. */
export async function signAndSend(
  wallet: Sendable,
  account: WalletAccount,
  transaction: Uint8Array,
  cluster: string,
): Promise<Outcome<string>> {
  const feature = wallet.features[SolanaSignAndSendTransaction];
  if (!feature) return held(`${wallet.name} cannot sign and send transactions.`);
  try {
    const [out] = await feature.signAndSendTransaction({ account, chain: chainId(cluster), transaction });
    if (!out) return held("The wallet returned no signature.");
    return ok(toBase58(out.signature));
  } catch (err) {
    return held(userFacing(err));
  }
}

/** Sign only: for a transaction that a relayer pays for and broadcasts. */
export async function signOnly(wallet: Sendable, account: WalletAccount, transaction: Uint8Array, cluster: string): Promise<Outcome<Uint8Array>> {
  const feature = wallet.features[SolanaSignTransaction];
  if (!feature) return held(`${wallet.name} cannot sign a transaction without sending it.`);
  try {
    const [out] = await feature.signTransaction({ account, chain: chainId(cluster), transaction });
    if (!out) return held("The wallet returned nothing.");
    return ok(out.signedTransaction);
  } catch (err) {
    return held(userFacing(err));
  }
}

/** Sign several transactions in one wallet prompt; none is sent. A run signs this way. */
export async function signAll(wallet: Sendable, account: WalletAccount, transactions: readonly Uint8Array[], cluster: string): Promise<Outcome<Uint8Array[]>> {
  const feature = wallet.features[SolanaSignTransaction];
  if (!feature) return held(`${wallet.name} cannot sign a transaction without sending it.`);
  try {
    const outs = await feature.signTransaction(...transactions.map((transaction) => ({ account, chain: chainId(cluster), transaction })));
    if (outs.length !== transactions.length) return held("The wallet returned fewer signatures than transactions.");
    return ok(outs.map((o) => o.signedTransaction));
  } catch (err) {
    return held(userFacing(err));
  }
}

/** A closed popup is not an error worth shouting about. */
export function userFacing(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/reject|denied|cancel|closed|dismiss/i.test(msg)) return "";
  return msg;
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}
