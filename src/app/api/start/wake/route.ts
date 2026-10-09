import { NextResponse } from "next/server";
import { assetByMint } from "@/lib/assets/registry";
import { wakeKeepers } from "@/lib/keeper/health";

export const dynamic = "force-dynamic";

/**
 * A START JUST LANDED — tell Scrip's servers to look now, so the first save prints while the
 * saver is still watching. It carries nothing and changes nothing: the services read the chain
 * themselves and space their own looks, so the most this can do is make one look sooner.
 */
const g = globalThis as typeof globalThis & {
  __scripWakeAt?: number;
  __scripWarmAt?: Map<string, number>;
};
/** A stock's price is readied at most this often from here; the service shares it for eight minutes anyway. */
const WARM_GAP_MS = 20_000;

export async function POST(req: Request) {
  // `{ mint }` while a start is being approved: ready that stock's price so the first save does
  // not wait for it. Only a stock a rule can save into; anything else is a plain wake.
  const body = (await req.json().catch(() => null)) as { mint?: unknown } | null;
  const asset = typeof body?.mint === "string" ? assetByMint(body.mint) : undefined;
  const warm = asset && asset.ruleEligible ? asset.mint : undefined;
  if (warm) {
    const seen = (g.__scripWarmAt ??= new Map());
    if (Date.now() - (seen.get(warm) ?? 0) < WARM_GAP_MS)
      return NextResponse.json({ woke: 0, warming: true }, { status: 202 });
    seen.set(warm, Date.now());
    if (seen.size > 100) seen.clear();
  }
  const now = Date.now();
  if (!warm && now - (g.__scripWakeAt ?? 0) < 1_000)
    return NextResponse.json({ woke: 0 }, { status: 202 });
  if (!warm) g.__scripWakeAt = now;
  const woke = await wakeKeepers(warm);
  return NextResponse.json({ woke, warming: Boolean(warm) }, { status: 202 });
}
