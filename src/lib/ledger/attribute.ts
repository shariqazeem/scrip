import { type Connection, PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { usdcAta } from "@/lib/rule/instructions";
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
export type Attribution = { readonly from: string; readonly usdc: string; readonly sig: string };

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
  for (const s of sigs) {
    if (s.err || BigInt(s.slot) > sweepSlot) continue;
    if (covered >= basisUsdc) break;
    const tx = bySignature.get(s.signature) ?? null;
    if (!tx?.meta) continue;
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? undefined });
    const ownerIdx = [...Array(keys.length).keys()].find((i) => keys.get(i)?.toBase58() === ata);
    if (ownerIdx === undefined) continue;
    const before = BigInt(pre.find((b) => b.accountIndex === ownerIdx)?.uiTokenAmount.amount ?? "0");
    const after = BigInt(post.find((b) => b.accountIndex === ownerIdx)?.uiTokenAmount.amount ?? "0");
    const delta = after - before;
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
    out.push({ from, usdc: delta.toString(), sig: s.signature });
    covered += delta;
  }
  return ok(out);
}
