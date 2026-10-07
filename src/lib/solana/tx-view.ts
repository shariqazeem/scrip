import type { Connection } from "@solana/web3.js";
import { fromBase58 } from "./base58";

/**
 * ONE SHAPE FOR ANY TRANSACTION, WHATEVER ITS VERSION.
 *
 * web3.js decodes legacy and v0 messages and throws on anything newer, and mainnet already
 * carries v1 transactions: one in a batch fails the whole batch. So the readers that look at
 * other people's transactions (a wallet's payments, a save's receipt) ask the RPC to parse
 * them (`jsonParsed`, any version) and read this shape, which needs no message decoder:
 * every key in balance order, who signed, the balances before and after, and each
 * instruction as a program, its accounts and its bytes.
 */

export type TokenBalance = {
  readonly accountIndex: number;
  readonly mint: string;
  readonly owner?: string;
  readonly uiTokenAmount: { readonly amount: string; readonly decimals: number };
};

export type Ix = {
  readonly programId: string;
  readonly accounts: readonly string[];
  /** The instruction's bytes, when the RPC did not parse it into JSON. */
  readonly data: Uint8Array | null;
  /** What the RPC parsed it into, for the programs it knows (a memo is its text). */
  readonly parsed: unknown;
};

export type TxView = {
  readonly sig: string;
  readonly slot: number;
  readonly blockTime: number;
  readonly err: unknown;
  readonly fee: number;
  /** Every key the transaction names, in the order the balances use. */
  readonly keys: readonly string[];
  readonly signers: readonly string[];
  readonly preBalances: readonly number[];
  readonly postBalances: readonly number[];
  readonly preTokenBalances: readonly TokenBalance[];
  readonly postTokenBalances: readonly TokenBalance[];
  readonly instructions: readonly Ix[];
  /** Every inner instruction, in execution order. */
  readonly inner: readonly Ix[];
};

type RawIx = { programId: string; accounts?: string[]; data?: string; parsed?: unknown };
type RawTx = {
  slot: number;
  blockTime?: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
    innerInstructions?: Array<{ index: number; instructions: RawIx[] }> | null;
  } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: Array<{ pubkey: string; signer: boolean }>; instructions: RawIx[] };
  };
};

function ix(r: RawIx): Ix {
  return { programId: r.programId, accounts: r.accounts ?? [], data: typeof r.data === "string" ? fromBase58(r.data) : null, parsed: r.parsed ?? null };
}

/** The RPC's parsed JSON for one transaction → the view. Null for a transaction with no meta. */
export function viewOf(sig: string, raw: RawTx | null): TxView | null {
  if (!raw || !raw.meta) return null;
  const inner = [...(raw.meta.innerInstructions ?? [])].sort((a, b) => a.index - b.index).flatMap((g) => g.instructions.map(ix));
  return {
    sig,
    slot: raw.slot,
    blockTime: raw.blockTime ?? 0,
    err: raw.meta.err,
    fee: raw.meta.fee,
    keys: raw.transaction.message.accountKeys.map((k) => k.pubkey),
    signers: raw.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey),
    preBalances: raw.meta.preBalances,
    postBalances: raw.meta.postBalances,
    preTokenBalances: raw.meta.preTokenBalances ?? [],
    postTokenBalances: raw.meta.postTokenBalances ?? [],
    instructions: raw.transaction.message.instructions.map(ix),
    inner,
  };
}

type Rpc = { _rpcRequest(method: string, args: unknown[]): Promise<{ result?: unknown; error?: { message: string } }> };
type BatchRpc = { _rpcBatchRequest(requests: Array<{ methodName: string; args: unknown[] }>): Promise<Array<{ result?: unknown; error?: { message: string } }>> };

const CONFIG = { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" };

/**
 * One transaction, parsed by the RPC, through the connection's own gate. Null when it has not
 * settled yet (or never existed); a thrown error when the RPC refused.
 */
export async function readTxView(conn: Connection, sig: string): Promise<TxView | null> {
  const res = await (conn as unknown as Rpc)._rpcRequest("getTransaction", [sig, CONFIG]);
  if (res.error) throw new Error(res.error.message);
  return viewOf(sig, (res.result ?? null) as RawTx | null);
}

/** Several at once, in one batch; an entry the RPC could not return is null, never a thrown batch. */
export async function readTxViews(conn: Connection, sigs: readonly string[]): Promise<Array<TxView | null>> {
  if (sigs.length === 0) return [];
  const out = await (conn as unknown as BatchRpc)._rpcBatchRequest(sigs.map((s) => ({ methodName: "getTransaction", args: [s, CONFIG] })));
  return out.map((r, i) => (r.error ? null : viewOf(sigs[i]!, (r.result ?? null) as RawTx | null)));
}
