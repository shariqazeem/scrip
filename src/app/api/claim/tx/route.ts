import { PublicKey, Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint } from "@/lib/assets/registry";
import { readBookOf, resolveHandle, usdcMintFor } from "@/lib/book/read-book";
import { readPayout } from "@/lib/book/read-payout";
import { validateSlug } from "@/lib/handle";
import { claimPayoutIx } from "@/lib/intake/instructions";
import { openBookIx } from "@/lib/rule/instructions";
import { connection } from "@/lib/solana/connection";
import { relayerKeypair } from "@/lib/relayer";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * BUILD A CLAIM — fee-sponsored, so an empty wallet can take a first position.
 *
 *     [open_book (if the claimer has none), claim_payout]
 *
 * The relayer is the fee payer and pays the rents; it signs here, partially. The claimer
 * signs in their wallet; a link-based claim adds the claim key's signature in the browser.
 * The fully signed transaction comes back through /api/relay. The relayer chooses nothing:
 * the escrow goes to the claimer and the receipt names the sponsor.
 */
export async function POST(req: NextRequest) {
  let body: { claimer?: unknown; payer?: unknown; releaseId?: unknown; claimKey?: unknown; slug?: unknown; termsVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let claimer: PublicKey;
  let payer: PublicKey;
  try {
    claimer = new PublicKey(String(body.claimer ?? ""));
    payer = new PublicKey(String(body.payer ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  const rid = releaseIdFromHex(String(body.releaseId ?? ""));
  if (!rid.ok) return NextResponse.json({ error: rid.why }, { status: 400 });
  let claimKey: PublicKey | null = null;
  if (typeof body.claimKey === "string" && body.claimKey) {
    try {
      claimKey = new PublicKey(body.claimKey);
    } catch {
      return NextResponse.json({ error: "The claim key is not valid." }, { status: 400 });
    }
  }

  const relayer = relayerKeypair();
  if (!relayer) return NextResponse.json({ error: "Claims are not sponsored on this deployment (no relayer key)." }, { status: 503 });

  const payout = await readPayout(payer.toBase58(), rid.value.length ? String(body.releaseId) : "");
  if (!payout.ok) return NextResponse.json({ error: payout.why }, { status: 503 });
  if (!payout.value) return NextResponse.json({ error: "That position was already claimed, or never existed." }, { status: 404 });
  const p = payout.value;
  if (p.recipient && p.recipient !== claimer.toBase58()) return NextResponse.json({ error: "This position is for a different address." }, { status: 403 });
  if (!p.recipient && (!claimKey || claimKey.toBase58() !== p.claimant)) return NextResponse.json({ error: "This link needs its claim key." }, { status: 403 });
  const asset = assetByMint(p.asset);
  if (!asset) return NextResponse.json({ error: "The sponsored asset is not on the registry." }, { status: 422 });

  const conn = connection();
  const existing = await readBookOf(conn, claimer);
  if (!existing.ok) return NextResponse.json({ error: existing.why }, { status: 503 });
  const ixs = [];
  if (!existing.value) {
    const slug = validateSlug(String(body.slug ?? ""));
    if (!slug.ok) return NextResponse.json({ error: slug.why }, { status: 400 });
    const taken = await resolveHandle(slug.value);
    if (taken.ok && taken.value) return NextResponse.json({ error: `@${slug.value} is taken.` }, { status: 409 });
    const tv = Number(body.termsVersion ?? 0);
    if (asset.issuer.name.includes("xStocks") && tv < 1) return NextResponse.json({ error: "This asset needs the eligibility attestation." }, { status: 400 });
    const open = openBookIx({ owner: claimer, payer: relayer.publicKey, slug: slug.value, asset, usdcMint: usdcMintFor(null), termsVersion: tv });
    if (!open.ok) return NextResponse.json({ error: open.why }, { status: 400 });
    ixs.push(open.value);
  }
  const claim = claimPayoutIx({ claimer, feePayer: relayer.publicKey, claimKey, payer, releaseId: rid.value, asset });
  if (!claim.ok) return NextResponse.json({ error: claim.why }, { status: 400 });
  ixs.push(claim.value);

  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).` }, { status: 503 });
  }
  const tx = new Transaction({ feePayer: relayer.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.partialSign(relayer);
  return NextResponse.json({
    transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    needsClaimKey: !p.recipient,
    opensBook: !existing.value,
    asset: { symbol: asset.symbol, decimals: asset.decimals },
    escrowRaw: p.escrowRaw.toString(),
  });
}
