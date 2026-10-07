import { type NextRequest, NextResponse } from "next/server";
import { suggestSave } from "@/lib/save/amount";
import { readInflows } from "@/lib/save/inflows";

export const dynamic = "force-dynamic";

/**
 * WHAT THIS WALLET WAS PAID LATELY — the line the front door opens on once a wallet is
 * connected: "You received $250 on 6 Oct. Save 10%: $25." Read from the wallet's own USDC
 * history, and offered only when the wallet can spend the slice right now.
 *
 * Held for twenty seconds per wallet: a page that asks twice in a breath reads the chain once.
 */
const HOLD_MS = 20_000;
const g = globalThis as typeof globalThis & { __scripWalletPay?: Map<string, { at: number; body: unknown }> };
const cache = (g.__scripWalletPay ??= new Map());

export async function GET(_req: NextRequest, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const hit = cache.get(owner);
  if (hit && Date.now() - hit.at < HOLD_MS) return NextResponse.json(hit.body);
  const read = await readInflows(owner);
  if (!read.ok) return NextResponse.json({ error: read.why }, { status: 503 });
  const now = Math.floor(Date.now() / 1000);
  const s = suggestSave(read.value.inflows, read.value.usdc, now);
  const body = {
    usdc: read.value.usdc.toString(),
    lamports: read.value.lamports,
    inflows: read.value.inflows.slice(0, 5).map((f) => ({ sig: f.sig, at: f.at, usdc: f.usdc.toString(), from: f.from })),
    suggestion: s ? { sig: s.inflow.sig, at: s.inflow.at, usdc: s.inflow.usdc.toString(), saveUsdc: s.saveUsdc.toString(), rateBps: s.rateBps } : null,
  };
  if (cache.size > 2_000) cache.clear();
  cache.set(owner, { at: Date.now(), body });
  return NextResponse.json(body);
}
