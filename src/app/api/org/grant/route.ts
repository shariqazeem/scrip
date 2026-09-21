import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint, defaultAsset } from "@/lib/assets/registry";
import { buildGrant } from "@/lib/grant/build";
import { SUGGESTED_GRANT_FLOAT_LAMPORTS } from "@/lib/grant/instructions";
import { resolveRecipient } from "@/lib/org/resolve";
import { currentOwner } from "@/lib/session/server";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * A GRANT — stock bought now that vests on a schedule. The signed-in wallet is the payer;
 * one transaction opens the grant, routes the purchase into its escrow and seals it.
 */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { to?: unknown; dollars?: unknown; assetMint?: unknown; cliffSecs?: unknown; durationSecs?: unknown; revocable?: unknown; reason?: unknown; floatLamports?: unknown; startUnix?: unknown; runId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const dollars = Number(body.dollars);
  if (!Number.isFinite(dollars) || dollars < 1) return NextResponse.json({ error: "The minimum is $1." }, { status: 400 });
  const asset = typeof body.assetMint === "string" ? assetByMint(body.assetMint) : defaultAsset();
  if (!asset || !asset.ruleEligible) return NextResponse.json({ error: "Choose an asset from the registry." }, { status: 422 });
  const to = await resolveRecipient(String(body.to ?? ""), asset);
  if (!to.ok) return NextResponse.json({ error: to.why }, { status: 422 });
  if (to.value.owner === owner) return NextResponse.json({ error: "That is your own register." }, { status: 422 });
  let runId: Uint8Array | null = null;
  if (typeof body.runId === "string" && body.runId) {
    const r = releaseIdFromHex(body.runId);
    if (!r.ok) return NextResponse.json({ error: "That run id is not sixteen bytes of hex." }, { status: 400 });
    runId = r.value;
  }
  const built = await buildGrant({
    payer: new PublicKey(owner),
    recipient: new PublicKey(to.value.owner),
    asset,
    amountUsdc: BigInt(Math.round(dollars * 1e6)),
    reason: typeof body.reason === "string" ? body.reason : "",
    schedule: {
      startUnix: Number(body.startUnix ?? 0) || 0,
      cliffSecs: Math.max(0, Math.round(Number(body.cliffSecs ?? 0))),
      durationSecs: Math.max(0, Math.round(Number(body.durationSecs ?? 0))),
      revocable: body.revocable !== false,
    },
    floatLamports: body.floatLamports === undefined ? SUGGESTED_GRANT_FLOAT_LAMPORTS : BigInt(String(body.floatLamports)),
    runId,
  });
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
  return NextResponse.json({ ...built.value, to: { owner: to.value.owner, handle: to.value.handle, hasBook: to.value.hasBook }, asset: { symbol: asset.symbol, decimals: asset.decimals, mint: asset.mint } });
}
