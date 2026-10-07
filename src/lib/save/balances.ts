import { USDC_MINT } from "@/lib/assets/registry";
import type { TxView } from "@/lib/solana/tx-view";
import type { Inflow } from "./amount";

/**
 * WHO GAINED AND WHO LOST, IN ONE MINT — from a transaction's token balances alone.
 *
 * Every confirmed transaction carries the balance of each token account it touched, before
 * and after, with the account's owner. The difference per owner is what moved, without
 * decoding a single instruction, so it reads the same for a transfer, a swap or anything else.
 */
export function mintDeltas(tx: Pick<TxView, "preTokenBalances" | "postTokenBalances">, mint: string): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const add = (rows: TxView["preTokenBalances"], sign: 1n | -1n) => {
    for (const r of rows) {
      if (r.mint !== mint || !r.owner) continue;
      out.set(r.owner, (out.get(r.owner) ?? 0n) + sign * BigInt(r.uiTokenAmount.amount));
    }
  };
  add(tx.postTokenBalances, 1n);
  add(tx.preTokenBalances, -1n);
  return out;
}

/**
 * One payment into `owner`'s USDC, or null when this transaction was not one.
 *
 * A payment raised the wallet's USDC and the wallet did NOT sign it: somebody else moved the
 * money in. A swap the owner made, a transfer between their own accounts, a withdrawal they
 * signed for: none of those is pay. The sender is the other owner whose USDC fell the most.
 */
export function inflowFrom(tx: TxView, owner: string): Inflow | null {
  if (tx.err) return null;
  if (tx.signers.includes(owner)) return null;
  const deltas = mintDeltas(tx, USDC_MINT);
  const landed = deltas.get(owner) ?? 0n;
  if (landed <= 0n) return null;
  let from: string | null = null;
  let most = 0n;
  for (const [who, d] of deltas) {
    if (who === owner || d >= 0n) continue;
    if (d < most) {
      most = d;
      from = who;
    }
  }
  return { sig: tx.sig, at: tx.blockTime, usdc: landed, from };
}
