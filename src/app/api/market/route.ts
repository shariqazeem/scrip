import { NextResponse } from "next/server";
import { market } from "@/lib/market";

export const dynamic = "force-dynamic";

/** The market strip's poll: cached thirty seconds on the server, so a crowd costs Jupiter nothing. */
export async function GET() {
  const m = await market();
  return NextResponse.json(m, { headers: { "cache-control": "public, max-age=15" } });
}
