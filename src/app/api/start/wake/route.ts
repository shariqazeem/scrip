import { NextResponse } from "next/server";
import { wakeKeepers } from "@/lib/keeper/health";

export const dynamic = "force-dynamic";

/**
 * A START JUST LANDED — tell Scrip's servers to look now, so the first save prints while the
 * saver is still watching. It carries nothing and changes nothing: the services read the chain
 * themselves and space their own looks, so the most this can do is make one look sooner.
 */
const g = globalThis as typeof globalThis & { __scripWakeAt?: number };

export async function POST() {
  const now = Date.now();
  if (now - (g.__scripWakeAt ?? 0) < 1_000) return NextResponse.json({ woke: 0 }, { status: 202 });
  g.__scripWakeAt = now;
  const woke = await wakeKeepers();
  return NextResponse.json({ woke }, { status: 202 });
}
