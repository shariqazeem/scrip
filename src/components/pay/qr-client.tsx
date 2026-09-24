"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * A QR drawn in the browser, for a code whose contents change as someone types — the amount on
 * the rule page's deposit, which follows the prepaid-receipts field. The server's `QrSvg` stays
 * the one for anything fixed at render. Black on transparent, the only colours a scanner trusts.
 */
export function QrClient({ text, size = 140, label }: { text: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#0000" } })
      .then((s) => {
        if (live) setSvg(s);
      })
      .catch(() => {
        if (live) setSvg(null);
      });
    return () => {
      live = false;
    };
  }, [text]);
  if (!svg) return <div style={{ width: size, height: size }} aria-hidden />;
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 33 33";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return <svg viewBox={viewBox} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" dangerouslySetInnerHTML={{ __html: inner }} />;
}
