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
  /** The log lines, where Anchor writes its events (`Program data: …`). */
  readonly logs: readonly string[];
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
    logMessages?: string[] | null;
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
    logs: raw.meta.logMessages ?? [],
  };
}

type Rpc = { _rpcRequest(method: string, args: unknown[]): Promise<{ result?: unknown; error?: { message: string } }> };
type BatchRpc = { _rpcBatchRequest(requests: Array<{ methodName: string; args: unknown[] }>): Promise<Array<{ result?: unknown; error?: { message: string } }>> };

const CONFIG = { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" };

/**
 * EVERY TRANSACTION READ ONCE. A confirmed transaction never changes, and the same few were read
 * again on every look: the register's live view asked for each save's later transactions every
 * fifteen seconds per open tab. On 12 November 2026 that, with the rest, spent Solana's public
 * budget for reading transactions, and a launch's history came back refused. Held per process;
 * past MAX_HELD the oldest is let go.
 */
const MAX_HELD = 1_500;
const store = globalThis as typeof globalThis & { __scripTxViews?: Map<string, TxView> };
const heldViews = (store.__scripTxViews ??= new Map<string, TxView>());
function remember(v: TxView): void {
  if (heldViews.has(v.sig)) return;
  if (heldViews.size >= MAX_HELD) {
    const oldest = heldViews.keys().next().value;
    if (oldest !== undefined) heldViews.delete(oldest);
  }
  heldViews.set(v.sig, v);
}

/**
 * One transaction, parsed by the RPC, through the connection's own gate. Null when it has not
 * settled yet (or never existed); a thrown error when the RPC refused.
 */
export async function readTxView(conn: Connection, sig: string): Promise<TxView | null> {
  const hit = heldViews.get(sig);
  if (hit) return hit;
  const res = await (conn as unknown as Rpc)._rpcRequest("getTransaction", [sig, CONFIG]);
  if (res.error) throw new Error(res.error.message);
  const view = viewOf(sig, (res.result ?? null) as RawTx | null);
  if (view) remember(view);
  return view;
}

/**
 * The most transactions asked for in one batch. Solana's public endpoint counts every call inside
 * a batch against its budget for the method, and refuses the entries past it.
 */
const CHUNK = 10;
/** A patient reader asks refused entries again after these pauses: the budget refills each ten seconds. */
const PAUSES_MS = [2_000, 5_000] as const;
const REFUSED = /too many requests|rate limit|429/i;

type Got = { sig: string; error?: string; view: TxView | null };

async function readMany(conn: Connection, sigs: readonly string[], patient: boolean): Promise<Got[]> {
  const out = new Map<string, Got>();
  let pending: string[] = [];
  for (const sig of new Set(sigs)) {
    const hit = heldViews.get(sig);
    if (hit) out.set(sig, { sig, view: hit });
    else pending.push(sig);
  }
  for (let round = 0; pending.length > 0; round += 1) {
    if (round > 0) await new Promise((r) => setTimeout(r, PAUSES_MS[round - 1]));
    const lastRound = !patient || round >= PAUSES_MS.length;
    const again: string[] = [];
    for (let i = 0; i < pending.length; i += CHUNK) {
      const slice = pending.slice(i, i + CHUNK);
      const got = await (conn as unknown as BatchRpc)._rpcBatchRequest(slice.map((s) => ({ methodName: "getTransaction", args: [s, CONFIG] })));
      got.forEach((r, j) => {
        const sig = slice[j]!;
        const error = r.error?.message;
        if (error && !lastRound && REFUSED.test(error)) {
          again.push(sig);
          return;
        }
        const view = error ? null : viewOf(sig, (r.result ?? null) as RawTx | null);
        if (view) remember(view);
        out.set(sig, { sig, error, view });
      });
    }
    pending = again;
  }
  return sigs.map((sig) => out.get(sig) ?? { sig, error: "not read", view: null });
}

/** Several at once, in batches; an entry the RPC could not return is null, never a thrown batch. */
export async function readTxViews(conn: Connection, sigs: readonly string[]): Promise<Array<TxView | null>> {
  if (sigs.length === 0) return [];
  return (await readMany(conn, sigs, false)).map((r) => r.view);
}

/**
 * EVERY ONE OF THEM, OR NOTHING. For a reader that sums what it finds (the fees a Plan received)
 * or draws every trade: an entry the RPC refused is a hole, and a total with a hole in it is a
 * wrong number. On 12 November 2026 a Plan's fees from launches read 0.000028 where they were
 * 0.000120, because the entries past the public endpoint's budget came back refused and were
 * skipped. Refused entries are asked again twice, after a pause; then it throws. A transaction
 * the RPC does not know is null.
 */
export async function readTxViewsAll(conn: Connection, sigs: readonly string[]): Promise<Array<TxView | null>> {
  if (sigs.length === 0) return [];
  const got = await readMany(conn, sigs, true);
  const refused = got.filter((r) => r.error);
  if (refused.length > 0) throw new Error(`${refused.length} of ${got.length} transactions could not be read (${refused[0]!.error})`);
  return got.map((r) => r.view);
}
