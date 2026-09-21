import QRCode from "qrcode";

/**
 * A QR CODE AS INLINE SVG, rendered on the server. No client JavaScript, no image request,
 * and it prints. Colours are inherited from the page: the modules are `currentColor`.
 */
export async function QrSvg({ text, size = 180, label }: { text: string; size?: number; label: string }) {
  const svg = await QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#0000" } });
  // Strip the fixed fill so the page's ink colours the modules.
  const inner = svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "").replace(/fill="#000000"/g, 'fill="currentColor"');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 33 33";
  return (
    <svg viewBox={viewBox} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
