import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { liveView } from "@/lib/book/live";
import { priceWait } from "@/lib/book/waiting";
import { currentOwner } from "@/lib/session/server";

export const dynamic = "force-dynamic";

/** A start is "just now" for this long: the window in which anyone holding the address may watch it. */
const WATCH_WINDOW_SECONDS = 30 * 60;

/**
 * WATCHING A START — what the start card shows between the approval and the first receipt:
 * the rule on, the first payment waiting to be saved (and why, if it waits), then the receipt.
 *
 * The owner may always read it. Anyone else, only in the half hour after the rule was turned
 * on, and only this: a wallet that did not sign in (no `solana:signIn`) still watches its own
 * first save, and nothing here is more than the chain already shows of that address. A register
 * stays private otherwise (`/api/book/live`).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  const view = await liveView(owner);
  if (!view.ok) return NextResponse.json({ error: view.why }, { status: 503 });
  const v = view.value;
  const now = Math.floor(Date.now() / 1000);
  const mine = (await currentOwner()) === owner;
  if (!mine && (!v.ruleOn || now - v.enabledUnix > WATCH_WINDOW_SECONDS)) return NextResponse.json({ error: "Nothing to watch." }, { status: 404 });

  const first = [...v.arrivals].filter((a) => a.kind === "sweep" && a.settledUnix >= v.enabledUnix).sort((a, b) => a.settledUnix - b.settledUnix)[0] ?? null;
  const waiting = priceWait({ ruleOn: v.ruleOn, unswept: v.unswept, symbol: v.asset?.symbol ?? null, lastReason: v.keeper.lastReason });
  return NextResponse.json(
    {
      at: v.at,
      ruleOn: v.ruleOn,
      state: v.state,
      enabledUnix: v.enabledUnix,
      rateBps: v.rateNowBps,
      asset: v.asset,
      unswept: v.unswept,
      sliceNext: v.sliceNext,
      sweeps: v.sweeps,
      waiting: waiting ? waiting.detail : null,
      waitingForPrice: Boolean(v.keeper.lastReason?.startsWith("waiting for a fresh price")),
      first: first
        ? {
            sig: first.sig,
            basisUsdc: first.basisUsdc,
            paidUsdc: first.paidUsdc,
            amountRaw: first.amountRaw,
            settledUnix: first.settledUnix,
            seconds: Math.max(0, first.settledUnix - v.enabledUnix),
            match: first.match ?? null,
          }
        : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
