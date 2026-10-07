import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "@/lib/assets/registry";
import { MEMO_PROGRAM_ID } from "@/lib/intake/memo";
import type { TxView } from "@/lib/solana/tx-view";
import { mintDeltas } from "./balances";
import { SAVE_MARK, SAVE_MEMO } from "./mark";

/**
 * A SAVE, READ FROM ITS TRANSACTION AND NOTHING ELSE.
 *
 * The saver is the wallet that paid for and signed the transaction carrying the memo
 * `scrip:save:v1`. What they paid is their USDC's fall; what they got is the one other mint
 * whose balance rose in an account they own. The route is read from Jupiter's own swap
 * events, emitted inside the transaction (one per hop: which pool program, what went in,
 * what came out). Every figure is in the transaction's balances or instructions, so a
 * stranger with any RPC reads the same save.
 */

export const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
/** Anchor's tag for an event emitted by self-CPI: the first eight bytes of the instruction. */
const EVENT_IX_TAG = Uint8Array.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);
const SWAP_EVENT = sha256(new TextEncoder().encode("event:SwapEvent")).slice(0, 8);
const EVENT_LEN = 16 + 32 + 32 + 8 + 32 + 8;

export type Hop = {
  /** The pool program the hop ran through. */
  readonly amm: string;
  readonly inMint: string;
  readonly inAmount: bigint;
  readonly outMint: string;
  readonly outAmount: bigint;
};

export type ParsedSave = {
  readonly sig: string;
  readonly owner: string;
  readonly slot: number;
  readonly blockTime: number;
  readonly paidUsdc: bigint;
  readonly mint: string;
  readonly amountRaw: bigint;
  readonly decimals: number;
  readonly marked: boolean;
  readonly hops: readonly Hop[];
  readonly feeLamports: number;
  /** Lamports placed in a stock account this transaction opened: the deposit, zero when it existed. */
  readonly depositLamports: number;
};

function u64le(b: Uint8Array, at: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i -= 1) v = (v << 8n) | BigInt(b[at + i]!);
  return v;
}

function startsWith(b: Uint8Array, prefix: Uint8Array, at = 0): boolean {
  if (b.length < at + prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (b[at + i] !== prefix[i]) return false;
  return true;
}

/** Jupiter's swap events, in order, from the inner instructions it emits them by. */
export function hopsOf(tx: Pick<TxView, "inner">): Hop[] {
  const hops: Hop[] = [];
  for (const ix of tx.inner) {
    if (ix.programId !== JUPITER_PROGRAM_ID || !ix.data || ix.data.length < EVENT_LEN) continue;
    const b = ix.data;
    if (!startsWith(b, EVENT_IX_TAG) || !startsWith(b, SWAP_EVENT, 8)) continue;
    const o = 16;
    hops.push({
      amm: new PublicKey(b.slice(o, o + 32)).toBase58(),
      inMint: new PublicKey(b.slice(o + 32, o + 64)).toBase58(),
      inAmount: u64le(b, o + 64),
      outMint: new PublicKey(b.slice(o + 72, o + 104)).toBase58(),
      outAmount: u64le(b, o + 104),
    });
  }
  return hops;
}

/** The memo's text, when the transaction carries the SPL memo at the top level. */
export function memoText(tx: Pick<TxView, "instructions">): string | null {
  for (const ix of tx.instructions) {
    if (ix.programId !== MEMO_PROGRAM_ID) continue;
    if (typeof ix.parsed === "string") return ix.parsed;
    if (ix.data) return new TextDecoder().decode(ix.data);
  }
  return null;
}

/** The save in this transaction, or null when it is not one. */
export function parseSave(tx: TxView): ParsedSave | null {
  if (tx.err) return null;
  if (memoText(tx) !== SAVE_MEMO) return null;
  // The fee payer signed the memo and paid: that wallet is the saver.
  const owner = tx.keys[0];
  if (!owner || !tx.signers.includes(owner)) return null;

  const paid = -(mintDeltas(tx, USDC_MINT).get(owner) ?? 0n);
  if (paid <= 0n) return null;
  // The stock: the mint, other than USDC, whose balance rose most in an account the saver owns.
  let best: { mint: string; amount: bigint; decimals: number; index: number } | null = null;
  for (const post of tx.postTokenBalances) {
    if (post.owner !== owner || post.mint === USDC_MINT) continue;
    const pre = tx.preTokenBalances.find((p) => p.accountIndex === post.accountIndex);
    const d = BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? "0");
    if (d > 0n && (!best || d > best.amount)) best = { mint: post.mint, amount: d, decimals: post.uiTokenAmount.decimals, index: post.accountIndex };
  }
  if (!best) return null;
  // The deposit: the stock account's lamports when this transaction is the one that opened it.
  const opened = (tx.preBalances[best.index] ?? 0) === 0 ? (tx.postBalances[best.index] ?? 0) : 0;

  return {
    sig: tx.sig,
    owner,
    slot: tx.slot,
    blockTime: tx.blockTime,
    paidUsdc: paid,
    mint: best.mint,
    amountRaw: best.amount,
    decimals: best.decimals,
    marked: tx.keys.includes(SAVE_MARK.toBase58()),
    hops: hopsOf(tx),
    feeLamports: tx.fee,
    depositLamports: opened,
  };
}
