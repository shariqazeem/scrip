import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { curveQuote, isCurveStock } from "@/lib/curve/preset";
import { nameOf } from "@/lib/save/names";

/**
 * A SCRIP CURVE TOKEN'S IMAGE, drawn from its symbol and the stock it is priced in: the ink
 * ground, the symbol, and the stock named beneath it. Every launch gets one, so nobody uploads
 * anything to scrip.work. Colours are the inverse tokens of src/styles/tokens.css.
 */
const INK = "#14161c";
const TEXT = "#f4f2ee";
const MUTED = "#b3b6bf";
const BLUE = "#9db0f7";
const GREEN = "#5fcf85";

export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const symbol = (p.get("s") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "?";
  const stock = p.get("k");
  const priced = isCurveStock(stock) ? nameOf(curveQuote(stock).symbol) : "a stock";
  const size = symbol.length <= 4 ? 150 : symbol.length <= 6 ? 112 : 84;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: INK, color: TEXT }}>
        <div style={{ display: "flex", width: 360, height: 360, borderRadius: 999, border: `10px solid ${BLUE}`, alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: size, fontWeight: 700, letterSpacing: -4 }}>{symbol}</div>
        </div>
        <div style={{ display: "flex", marginTop: 34, fontSize: 30, color: MUTED }}>
          priced in&nbsp;<span style={{ color: GREEN }}>{priced}</span>
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 24, color: MUTED }}>Scrip Curve</div>
      </div>
    ),
    { width: 512, height: 512, headers: { "cache-control": "public, max-age=86400, immutable" } },
  );
}
