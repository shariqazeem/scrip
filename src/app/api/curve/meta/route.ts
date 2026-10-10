import { type NextRequest, NextResponse } from "next/server";
import { launchNameProblem } from "@/lib/curve/names";
import { curveQuote, isCurveStock } from "@/lib/curve/preset";
import { nameOf } from "@/lib/save/names";
import { siteUrl } from "@/lib/site";

/**
 * A SCRIP CURVE TOKEN'S METADATA — what wallets and explorers read from the token's `uri`, made
 * from the name, symbol and stock the launcher chose (the same three the chain holds). No upload,
 * no free text: the image is drawn by Scrip from the symbol, so nothing anyone launches can put
 * a picture or a claim on scrip.work. Cached for a day; it never changes for a given address.
 */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const name = (p.get("n") ?? "").trim().slice(0, 32);
  const symbol = (p.get("s") ?? "").trim().toUpperCase().slice(0, 10);
  const stock = p.get("k");
  if (!isCurveStock(stock) || launchNameProblem(name, symbol)) return NextResponse.json({ error: "Not a Scrip Curve token." }, { status: 404 });
  const site = siteUrl();
  const priced = nameOf(curveQuote(stock).symbol);
  const icon = `${site}/api/curve/icon?${new URLSearchParams({ s: symbol, k: stock })}`;
  return NextResponse.json(
    {
      name,
      symbol,
      description: `Launched on Scrip Curve, priced in ${priced}. Every trading fee it pays goes to savers, through a Scrip Plan. Not a stock and not a share of one; Scrip makes no claim about its price.`,
      image: icon,
      external_url: `${site}/curve`,
      properties: { files: [{ uri: icon, type: "image/png" }], category: "image" },
    },
    { headers: { "cache-control": "public, max-age=86400, immutable" } },
  );
}
