import { type Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { assetByMint } from "@/lib/assets/registry";
import { readBookOf, resolveHandle, usdcMintFor } from "@/lib/book/read-book";
import { readPayout } from "@/lib/book/read-payout";
import { validateSlug } from "@/lib/handle";
import { claimPayoutIx } from "@/lib/intake/instructions";
import { openBookIx } from "@/lib/rule/instructions";
import { releaseIdFromHex } from "@/lib/solana/program";

/**
 * THE CLAIM, DEFINED ONCE.
 *
 *     [open_book (if the claimer has none), claim_payout]
 *
 * Two routes need exactly these instructions: /api/claim/tx builds them for the wallet to
 * sign, and /api/relay rebuilds them to check that what came back is still that claim before
 * the relayer co-signs. If the two were written separately they would drift, and the first
 * drift would be the relayer refusing honest claims — or, worse, accepting altered ones.
 *
 * The relayer chooses nothing here: the escrow goes to the claimer, the handle is theirs,
 * and the receipt names the sponsor.
 */
export type ClaimParams = {
  readonly claimer: unknown;
  readonly payer: unknown;
  readonly releaseId: unknown;
  readonly claimKey: unknown;
  readonly slug: unknown;
  readonly termsVersion: unknown;
};

export type BuiltClaim = {
  readonly instructions: TransactionInstruction[];
  readonly opensBook: boolean;
  readonly needsClaimKey: boolean;
  readonly asset: { readonly symbol: string; readonly decimals: number };
  readonly escrowRaw: bigint;
};

/** An Outcome with the HTTP status a route should answer with. */
export type ClaimBuild = { ok: true; value: BuiltClaim } | { ok: false; why: string; status: number };

const no = (status: number, why: string): ClaimBuild => ({ ok: false, why, status });

export async function buildClaim(conn: Connection, params: ClaimParams, relayer: PublicKey): Promise<ClaimBuild> {
  let claimer: PublicKey;
  let payer: PublicKey;
  try {
    claimer = new PublicKey(String(params.claimer ?? ""));
    payer = new PublicKey(String(params.payer ?? ""));
  } catch {
    return no(400, "That is not a Solana address.");
  }
  const rid = releaseIdFromHex(String(params.releaseId ?? ""));
  if (!rid.ok) return no(400, rid.why);
  let claimKey: PublicKey | null = null;
  if (typeof params.claimKey === "string" && params.claimKey) {
    try {
      claimKey = new PublicKey(params.claimKey);
    } catch {
      return no(400, "The claim key is not valid.");
    }
  }

  const payout = await readPayout(payer.toBase58(), rid.value.length ? String(params.releaseId) : "");
  if (!payout.ok) return no(503, payout.why);
  if (!payout.value) return no(404, "That position was already claimed, or never existed.");
  const p = payout.value;
  if (p.recipient && p.recipient !== claimer.toBase58()) return no(403, "This position is for a different address.");
  if (!p.recipient && (!claimKey || claimKey.toBase58() !== p.claimant)) return no(403, "This link needs its claim key.");
  const asset = assetByMint(p.asset);
  if (!asset) return no(422, "The sponsored asset is not on the registry.");

  const existing = await readBookOf(conn, claimer);
  if (!existing.ok) return no(503, existing.why);
  const instructions: TransactionInstruction[] = [];
  if (!existing.value) {
    const slug = validateSlug(String(params.slug ?? ""));
    if (!slug.ok) return no(400, slug.why);
    const taken = await resolveHandle(slug.value);
    if (taken.ok && taken.value) return no(409, `@${slug.value} is taken.`);
    const tv = Number(params.termsVersion ?? 0);
    if (asset.issuer.name.includes("xStocks") && tv < 1) return no(400, "This asset needs the eligibility attestation.");
    const open = openBookIx({ owner: claimer, payer: relayer, slug: slug.value, asset, usdcMint: usdcMintFor(null), termsVersion: tv });
    if (!open.ok) return no(400, open.why);
    instructions.push(open.value);
  }
  const claim = claimPayoutIx({ claimer, feePayer: relayer, claimKey, payer, releaseId: rid.value, asset });
  if (!claim.ok) return no(400, claim.why);
  instructions.push(claim.value);

  return {
    ok: true,
    value: {
      instructions,
      opensBook: !existing.value,
      needsClaimKey: !p.recipient,
      asset: { symbol: asset.symbol, decimals: asset.decimals },
      escrowRaw: p.escrowRaw,
    },
  };
}
