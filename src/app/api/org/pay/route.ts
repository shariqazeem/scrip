import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { intakes } from "@/lib/db/schema";
import { buildIntake } from "@/lib/intake/build";
import { resolveRecipient } from "@/lib/org/resolve";
import { currentOwner } from "@/lib/session/server";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * PAY ONE, IN STOCK OR SPLIT. The signed-in wallet pays `dollars` to a handle or an address:
 * `stockBps` of it becomes their register's asset with a receipt, the rest lands as USDC in
 * the same transaction. An address with no register gets its stock part in escrow, to claim.
 */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { to?: unknown; dollars?: unknown; stockBps?: unknown; reason?: unknown; assetMint?: unknown; runId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const dollars = Number(body.dollars);
  if (!Number.isFinite(dollars) || dollars < 1) return NextResponse.json({ error: "The minimum is $1." }, { status: 400 });
  const stockBps = body.stockBps === undefined ? 10_000 : Number(body.stockBps);
  if (!Number.isInteger(stockBps) || stockBps < 100 || stockBps > 10_000) return NextResponse.json({ error: "The stock share must be between 1% and 100%." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason : "";
  const preferred = typeof body.assetMint === "string" ? (assetByMint(body.assetMint) ?? null) : null;
  let runId: Uint8Array | null = null;
  if (typeof body.runId === "string" && body.runId) {
    const r = releaseIdFromHex(body.runId);
    if (!r.ok) return NextResponse.json({ error: "That run id is not sixteen bytes of hex." }, { status: 400 });
    runId = r.value;
  }

  const to = await resolveRecipient(String(body.to ?? ""), preferred);
  if (!to.ok) return NextResponse.json({ error: to.why }, { status: 422 });
  if (to.value.owner === owner) return NextResponse.json({ error: "That is your own register." }, { status: 422 });

  const total = BigInt(Math.round(dollars * 1e6));
  const stockUsdc = (total * BigInt(stockBps)) / 10_000n;
  const cashUsdc = total - stockUsdc;
  if (stockUsdc < 1_000_000n) return NextResponse.json({ error: "The stock part must be at least $1." }, { status: 400 });

  const built = await buildIntake({
    payer: new PublicKey(owner),
    recipient: new PublicKey(to.value.owner),
    asset: to.value.asset,
    amountUsdc: stockUsdc,
    reason,
    mode: to.value.hasBook ? "pay" : "gift",
    runId,
    cashUsdc,
  });
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422 });
  await db
    .insert(intakes)
    .values({ releaseId: built.value.releaseId, payer: owner, owner: to.value.owner })
    .onConflictDoUpdate({ target: intakes.releaseId, set: { payer: owner } });
  return NextResponse.json({
    ...built.value,
    mode: to.value.hasBook ? "pay" : "gift",
    to: { owner: to.value.owner, handle: to.value.handle, hasBook: to.value.hasBook },
    asset: { symbol: to.value.asset.symbol, decimals: to.value.asset.decimals, mint: to.value.asset.mint },
    stockUsdc: stockUsdc.toString(),
    cashUsdc: cashUsdc.toString(),
  });
}
