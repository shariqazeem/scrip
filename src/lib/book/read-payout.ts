import "server-only";

import { PublicKey } from "@solana/web3.js";
import { unpackAccount } from "@solana/spl-token";
import { type Asset, assetByMint } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { assetAta, tokenProgramFor } from "@/lib/rule/instructions";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID, payoutPda, releaseIdFromHex } from "@/lib/solana/program";
import { type Payout, decodePayout } from "./decode";

/**
 * A SPONSORED POSITION, WAITING — read for the claim page by (payer, release id).
 *
 * What it holds is what its escrow holds, read from the token account, never a counter.
 */
export type PayoutView = Payout & {
  readonly address: string;
  readonly asset_: Asset | null;
  readonly escrowRaw: bigint;
};

export async function readPayout(payerAddress: string, releaseIdHex: string): Promise<Outcome<PayoutView | null>> {
  let payer: PublicKey;
  try {
    payer = new PublicKey(payerAddress);
  } catch {
    return held("That is not a Solana address.");
  }
  const rid = releaseIdFromHex(releaseIdHex);
  if (!rid.ok) return rid;
  const address = payoutPda(payer, rid.value);
  const conn = connection();
  let info;
  try {
    info = await conn.getAccountInfo(address, "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!info || !info.owner.equals(SCRIP_PROGRAM_ID)) return ok(null);
  const p = decodePayout(info.data);
  if (!p.ok) return p;
  const asset = assetByMint(p.value.asset) ?? null;
  let escrowRaw = 0n;
  if (asset) {
    const escrow = assetAta(address, asset, true);
    try {
      const e = await conn.getAccountInfo(escrow, "confirmed");
      if (e) escrowRaw = unpackAccount(escrow, e, tokenProgramFor(asset)).amount;
    } catch {
      // An unreadable escrow reads as zero here; the claim itself reads the real amount.
    }
  }
  return ok({ ...p.value, address: address.toBase58(), asset_: asset, escrowRaw });
}
