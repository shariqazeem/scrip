import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * THE DEMONSTRATION TOKEN'S IMAGE — deliberately plain: the word "demonstration", no Scrip
 * mark, so no wallet ever shows it as Scrip's token. Rendered once and cached by the CDN.
 */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#f7f5ef", color: "#14161c", fontFamily: "monospace" }}>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>DEMO1</div>
        <div style={{ display: "flex", fontSize: 26, color: "#5a5d66", marginTop: 16 }}>a demonstration launch</div>
      </div>
    ),
    { width: 512, height: 512, headers: { "cache-control": "public, max-age=86400" } },
  );
}
