import { type Connection, PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "@/lib/assets/registry";
import { START_MEMO, startedWith } from "@/lib/start/memo";
import { type Outcome, held, ok } from "@/lib/outcome";
import { usdcAta } from "@/lib/rule/instructions";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";
import { transactionsFor } from "@/lib/solana/batch";

/**
 * WHO SENT THE MONEY A SWEEP TAXED — read from the owner's USDC account's own history.
 *
 * A sweep receipt carries no payer: the payer sent dollars to a normal address and never
 * touched this program. What the chain does carry is every transfer into that account. The
 * indexer walks the account's signatures back from the sweep's slot, sums the inbound
 * transfers until it has covered the receipt's basis, and attaches the senders — labelled on
 * the page as "attributed from the account's transfer history", because that is what it is.
 */
/**
 * `at` is the arrival's block time, when the RPC reported one: the start of "landed to stock".
 * `start` marks the start transaction itself: the payment the rule counted as arriving when it was
 * turned on (`lib/start/instructions.ts`), from the saver's own balance, so `from` is the saver.
 */
export type Attribution = { readonly from: string; readonly usdc: string; readonly sig: string; readonly at?: number | null; readonly start?: boolean };

/** A start that counted a first payment says so in its memo, and the memo program logs it. */
export function isStartLog(logs: readonly string[] | null | undefined): boolean {
  return (logs ?? []).some((l) => l.includes(`"${START_MEMO}"`));
}

/** Scrip's program ran in this transaction. */
function invokesScrip(logs: readonly string[] | null | undefined): boolean {
  const mark = `Program ${SCRIP_PROGRAM_ID.toBase58()} invoke`;
  return (logs ?? []).some((l) => l.startsWith(mark));
}

export { startedWith };

export async function attributeSweep(
  conn: Connection,
  owner: string,
  sweepSlot: bigint,
  basisUsdc: bigint,
  usdcMint = USDC_MINT,
  maxSignatures = 40,
): Promise<Outcome<Attribution[]>> {
  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    return held("not an address");
  }
  const ata = usdcAta(ownerKey, new PublicKey(usdcMint)).toBase58();
  let sigs;
  try {
    sigs = await conn.getSignaturesForAddress(new PublicKey(ata), { limit: maxSignatures }, "confirmed");
  } catch (err) {
    return held(err instanceof Error ? err.message : String(err));
  }
  const bySignature = await transactionsFor(conn, sigs.map((s) => s.signature));
  const out: Attribution[] = [];
  let covered = 0n;
  // An earlier save on this register: the start's first payment, if it lies beyond, was that save's.
  let passedSave = false;
  for (const s of sigs) {
    if (s.err || BigInt(s.slot) > sweepSlot) continue;
    if (covered >= basisUsdc) break;
    const tx = bySignature.get(s.signature) ?? null;
    if (!tx?.meta) continue;
    // The start's first payment: set aside and handed back in one transaction, so the account's
    // balance did not change across it, yet the rule counted that much as arriving. What is left
    // of the basis came from here, and nothing older can be part of it.
    if (!passedSave && isStartLog(tx.meta.logMessages)) {
      out.push({ from: owner, usdc: (basisUsdc - covered).toString(), sig: s.signature, at: s.blockTime ?? null, start: true });
      covered = basisUsdc;
      break;
    }
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? undefined });
    const ownerIdx = [...Array(keys.length).keys()].find((i) => keys.get(i)?.toBase58() === ata);
    if (ownerIdx === undefined) continue;
    const before = BigInt(pre.find((b) => b.accountIndex === ownerIdx)?.uiTokenAmount.amount ?? "0");
    const after = BigInt(post.find((b) => b.accountIndex === ownerIdx)?.uiTokenAmount.amount ?? "0");
    const delta = after - before;
    if (delta < 0n && BigInt(s.slot) < sweepSlot && invokesScrip(tx.meta.logMessages)) passedSave = true;
    if (delta <= 0n) continue;
    // The sender: the other USDC account in this transaction whose balance fell by the delta.
    let from = "";
    for (const p of post) {
      if (p.accountIndex === ownerIdx || p.mint !== usdcMint) continue;
      const b = BigInt(pre.find((x) => x.accountIndex === p.accountIndex)?.uiTokenAmount.amount ?? "0");
      const a = BigInt(p.uiTokenAmount.amount);
      if (b - a === delta) {
        from = p.owner ?? keys.get(p.accountIndex)?.toBase58() ?? "";
        break;
      }
    }
    out.push({ from, usdc: delta.toString(), sig: s.signature, at: s.blockTime ?? null });
    covered += delta;
  }
  return ok(out);
}
