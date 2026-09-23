import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { assetByMint } from "@/lib/assets/registry";
import { readBookOf, resolveHandle } from "@/lib/book/read-book";
import { validateSlug } from "@/lib/handle";
import { buildIntake } from "@/lib/intake/build";
import { connection } from "@/lib/solana/connection";
import { siteUrl } from "@/lib/site";
import { db } from "@/lib/db";
import { intakes } from "@/lib/db/schema";
import { releaseIdFromHex } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * SOLANA PAY TRANSACTION REQUEST — the QR on `/pay/<handle>`.
 *
 * A phone wallet scans `solana:<this URL>?amount=&reason=`, GETs a label, POSTs its account,
 * and receives the same atomic intake transaction the desktop path builds. The payer never
 * holds a stock; the recipient's own account receives it.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const v = validateSlug(handle);
  if (!v.ok) return NextResponse.json({ error: v.why }, { status: 400, headers: CORS });
  return NextResponse.json({ label: `Pay @${v.value} in stock`, icon: `${siteUrl()}/icon.png` }, { headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const v = validateSlug(handle);
  if (!v.ok) return NextResponse.json({ error: v.why }, { status: 400, headers: CORS });
  const amount = Number(req.nextUrl.searchParams.get("amount") ?? "");
  const reason = req.nextUrl.searchParams.get("reason") ?? "";
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "The link carries no amount." }, { status: 400, headers: CORS });

  let account: PublicKey;
  try {
    account = new PublicKey(String(((await req.json()) as { account?: unknown }).account ?? ""));
  } catch {
    return NextResponse.json({ error: "The wallet sent no account." }, { status: 400, headers: CORS });
  }

  const ownerAddr = await resolveHandle(v.value);
  if (!ownerAddr.ok) return NextResponse.json({ error: ownerAddr.why }, { status: 503, headers: CORS });
  if (!ownerAddr.value) return NextResponse.json({ error: "Nobody has that handle." }, { status: 404, headers: CORS });
  const owner = new PublicKey(ownerAddr.value);
  const book = await readBookOf(connection(), owner);
  if (!book.ok || !book.value) return NextResponse.json({ error: "This handle has no register." }, { status: 404, headers: CORS });
  const asset = assetByMint(book.value.asset);
  if (!asset) return NextResponse.json({ error: "This book's asset is not on the registry." }, { status: 422, headers: CORS });

  const ridRaw = req.nextUrl.searchParams.get("rid") ?? "";
  const rid = ridRaw ? releaseIdFromHex(ridRaw) : null;
  const built = await buildIntake({
    payer: account,
    recipient: owner,
    asset,
    amountUsdc: BigInt(Math.round(amount * 1e6)),
    reason,
    releaseId: rid && rid.ok ? rid.value : undefined,
  });
  if (built.ok) {
    await db
      .insert(intakes)
      .values({ releaseId: built.value.releaseId, payer: account.toBase58(), owner: owner.toBase58() })
      .onConflictDoUpdate({ target: intakes.releaseId, set: { payer: account.toBase58() } });
  }
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: 422, headers: CORS });
  const units = Number(built.value.quote.outAmountRaw) / 10 ** asset.decimals;
  return NextResponse.json(
    { transaction: built.value.transactionBase64, message: `About ${units.toFixed(4)} ${asset.symbol} lands in @${v.value}'s wallet, with a receipt.` },
    { headers: CORS },
  );
}
