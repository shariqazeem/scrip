import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { intakes, runs } from "@/lib/db/schema";
import { buildIntake } from "@/lib/intake/build";
import { resolveRecipient } from "@/lib/org/resolve";
import { currentOwner } from "@/lib/session/server";
import { newReleaseId, toHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

const MAX_LINES = 40;

/**
 * A RUN — pay many in one sitting. Every line becomes one transaction sharing a run id; the
 * wallet signs them all at once; the receipts carry the id, so the run page is derivable
 * from the chain. Lines that cannot be built are returned as such, and nothing is sent by
 * this route: the browser sends what the wallet signed.
 */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { label?: unknown; assetMint?: unknown; items?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
  if (items.length === 0) return NextResponse.json({ error: "A run needs at least one line." }, { status: 400 });
  if (items.length > MAX_LINES) return NextResponse.json({ error: `A run holds at most ${MAX_LINES} lines; split it.` }, { status: 400 });
  const label = typeof body.label === "string" ? body.label.slice(0, 80) : "";
  const preferred = typeof body.assetMint === "string" ? (assetByMint(body.assetMint) ?? null) : null;
  const runId = newReleaseId();
  const payer = new PublicKey(owner);

  const lines: Array<{ to: string; owner: string | null; handle: string | null; hasBook: boolean; dollars: number; stockBps: number; reason: string; transactionBase64: string | null; releaseId: string | null; mode: "pay" | "gift" | null; error: string | null; units: string | null; symbol: string | null }> = [];
  for (const it of items) {
    const to = String(it.to ?? "");
    const dollars = Number(it.dollars);
    const stockBps = it.stockBps === undefined ? 10_000 : Number(it.stockBps);
    const reason = typeof it.reason === "string" ? it.reason.slice(0, 200) : "";
    const base = { to, dollars, stockBps, reason, owner: null, handle: null, hasBook: false, transactionBase64: null, releaseId: null, mode: null, units: null, symbol: null };
    if (!Number.isFinite(dollars) || dollars < 1) {
      lines.push({ ...base, error: "The minimum is $1." });
      continue;
    }
    if (!Number.isInteger(stockBps) || stockBps < 100 || stockBps > 10_000) {
      lines.push({ ...base, error: "The stock share must be between 1% and 100%." });
      continue;
    }
    const r = await resolveRecipient(to, preferred);
    if (!r.ok) {
      lines.push({ ...base, error: r.why });
      continue;
    }
    if (r.value.owner === owner) {
      lines.push({ ...base, error: "That is your own register." });
      continue;
    }
    const total = BigInt(Math.round(dollars * 1e6));
    const stockUsdc = (total * BigInt(stockBps)) / 10_000n;
    const cashUsdc = total - stockUsdc;
    if (stockUsdc < 1_000_000n) {
      lines.push({ ...base, owner: r.value.owner, handle: r.value.handle, hasBook: r.value.hasBook, error: "The stock part must be at least $1." });
      continue;
    }
    const built = await buildIntake({ payer, recipient: new PublicKey(r.value.owner), asset: r.value.asset, amountUsdc: stockUsdc, reason, mode: r.value.hasBook ? "pay" : "gift", runId, cashUsdc });
    if (!built.ok) {
      lines.push({ ...base, owner: r.value.owner, handle: r.value.handle, hasBook: r.value.hasBook, error: built.why });
      continue;
    }
    await db
      .insert(intakes)
      .values({ releaseId: built.value.releaseId, payer: owner, owner: r.value.owner })
      .onConflictDoUpdate({ target: intakes.releaseId, set: { payer: owner } });
    lines.push({
      ...base,
      owner: r.value.owner,
      handle: r.value.handle,
      hasBook: r.value.hasBook,
      transactionBase64: built.value.transactionBase64,
      releaseId: built.value.releaseId,
      mode: r.value.hasBook ? "pay" : "gift",
      units: built.value.quote.outAmountRaw,
      symbol: r.value.asset.symbol,
      error: null,
    });
  }
  const buildable = lines.filter((l) => l.transactionBase64);
  if (buildable.length > 0) {
    await db.insert(runs).values({ id: toHex(runId), payer: owner, label, planned: buildable.length }).onConflictDoNothing();
  }
  return NextResponse.json({ runId: toHex(runId), label, lines });
}
