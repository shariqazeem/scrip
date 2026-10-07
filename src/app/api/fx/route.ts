import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * ONE DOLLAR IN THE VIEWER'S CURRENCY — for display beside a dollar amount, never for a
 * transaction. The rate is ExchangeRate-API's open daily rate (open.er-api.com, no key), and
 * the page names it and its date wherever it shows a converted amount.
 *
 * Held for an hour across every caller; the source itself updates once a day.
 */
const SOURCE = "https://open.er-api.com/v6/latest/USD";
const HOLD_MS = 3_600_000;
const g = globalThis as typeof globalThis & { __scripFx?: { at: number; value: Promise<{ rates: Record<string, number>; updated: number } | null> } };

function rates() {
  const hit = g.__scripFx;
  if (hit && Date.now() - hit.at < HOLD_MS) return hit.value;
  const value = fetch(SOURCE, { cache: "no-store", signal: AbortSignal.timeout(6_000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ result?: string; rates?: Record<string, number>; time_last_update_unix?: number }>) : null))
    .then((j) => (j && j.result === "success" && j.rates ? { rates: j.rates, updated: j.time_last_update_unix ?? 0 } : null))
    .catch(() => null);
  g.__scripFx = { at: Date.now(), value };
  return value;
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("currency") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return NextResponse.json({ error: "Name a three-letter currency." }, { status: 400 });
  const r = await rates();
  const rate = r?.rates[code];
  if (!r || typeof rate !== "number" || !(rate > 0)) {
    g.__scripFx = undefined;
    return NextResponse.json({ error: "No rate for that currency right now." }, { status: 503 });
  }
  return NextResponse.json(
    { currency: code, perUsd: rate, updated: r.updated, source: "ExchangeRate-API", sourceUrl: "https://www.exchangerate-api.com" },
    { headers: { "cache-control": "public, max-age=900" } },
  );
}
