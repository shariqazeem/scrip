import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint, defaultAsset } from "@/lib/assets/registry";
import { solUsd } from "@/lib/market";
import { parseSaveUsd } from "@/lib/save/amount";
import { stockByMint } from "@/lib/save/catalogue";
import { buildStart } from "@/lib/start/build";

export const dynamic = "force-dynamic";

/**
 * BUILD A START — every payment, the first save, and any Plan invitation, for one approval
 * (`lib/start/build.ts`). Like a save, it is built for the address the wallet gave and only
 * that wallet can sign it, so it needs no sign-in first. It chooses nothing: the rate, the
 * stock and the first amount are the saver's, the route is Jupiter's, the rest are the rule
 * page's defaults.
 */
export async function POST(req: NextRequest) {
  let body: { owner?: unknown; assetMint?: unknown; rateBps?: unknown; saveUsd?: unknown; attested?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let owner: PublicKey;
  try {
    owner = new PublicKey(String(body.owner ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  if (!PublicKey.isOnCurve(owner.toBytes())) return NextResponse.json({ error: "The saver must be a wallet, not a program account." }, { status: 400 });
  const asset = body.assetMint ? assetByMint(String(body.assetMint)) : defaultAsset();
  if (!asset || !asset.ruleEligible) return NextResponse.json({ error: "Every payment can save into the stocks the chain can price; choose one of those." }, { status: 400 });
  const xstocks = asset.issuer.name.includes("xStocks");
  if (xstocks && body.attested !== true) return NextResponse.json({ error: "Confirm you are not a US person, and what this token is, first." }, { status: 400 });
  const rateBps = Number(body.rateBps);
  if (!Number.isInteger(rateBps)) return NextResponse.json({ error: "Choose how much of every payment to save." }, { status: 400 });

  let saveUsdc = 0n;
  const raw = typeof body.saveUsd === "number" || typeof body.saveUsd === "string" ? String(body.saveUsd) : "0";
  if (raw !== "0" && raw !== "") {
    const amount = parseSaveUsd(raw);
    if (!amount.ok) return NextResponse.json({ error: amount.why }, { status: 400 });
    saveUsdc = amount.usdc;
  }

  const [built, sol] = await Promise.all([
    buildStart({ owner, asset, stock: stockByMint(asset.mint) ?? null, rateBps, saveUsdc, termsVersion: xstocks ? 1 : 0 }),
    solUsd().catch(() => null),
  ]);
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
  return NextResponse.json({ ...built.value, solUsd: sol });
}
