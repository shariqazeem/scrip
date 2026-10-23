/**
 * PAINT OUT XSTOCKS' FRAME. Every xStocks tile is a square of one colour with a triangle at the
 * middle of each edge, a third of the side wide and a sixth deep, in a shade of that colour
 * (measured on 23 Oct 2026). Inside each triangle's box, a pixel whose colour lies on the line
 * from the background to the triangle's shade (the triangle and its soft edge) becomes the
 * background; anything else is the logo, and stays. Cropping the frame off instead cut wide
 * wordmarks such as Coca-Cola's.
 */
export function unframe(px: Uint8Array | Buffer, w: number, h: number): void {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const b0 = at(Math.round(w * 0.03), Math.round(h * 0.03));
  const B = [px[b0]!, px[b0 + 1]!, px[b0 + 2]!];
  const lo = Math.floor(w * 0.32);
  const hi = Math.ceil(w * 0.68);
  const deep = Math.ceil(h * 0.18);
  const boxes: Array<{ x0: number; x1: number; y0: number; y1: number; tx: number; ty: number }> = [
    { x0: lo, x1: hi, y0: 0, y1: deep, tx: w >> 1, ty: 1 },
    { x0: lo, x1: hi, y0: h - deep, y1: h, tx: w >> 1, ty: h - 2 },
    { x0: 0, x1: deep, y0: lo, y1: hi, tx: 1, ty: h >> 1 },
    { x0: w - deep, x1: w, y0: lo, y1: hi, tx: w - 2, ty: h >> 1 },
  ];
  for (const box of boxes) {
    const t0 = at(box.tx, box.ty);
    const T = [px[t0]!, px[t0 + 1]!, px[t0 + 2]!];
    const d = [T[0]! - B[0]!, T[1]! - B[1]!, T[2]! - B[2]!];
    const len2 = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!;
    if (len2 < 300) continue; // no frame on this edge
    for (let y = box.y0; y < box.y1; y += 1) {
      for (let x = box.x0; x < box.x1; x += 1) {
        const i = at(x, y);
        const p = [px[i]! - B[0]!, px[i + 1]! - B[1]!, px[i + 2]! - B[2]!];
        const t = Math.max(0, Math.min(1, (p[0]! * d[0]! + p[1]! * d[1]! + p[2]! * d[2]!) / len2));
        const ex = p[0]! - t * d[0]!;
        const ey = p[1]! - t * d[1]!;
        const ez = p[2]! - t * d[2]!;
        if (ex * ex + ey * ey + ez * ez < 22 * 22) {
          px[i] = B[0]!;
          px[i + 1] = B[1]!;
          px[i + 2] = B[2]!;
        }
      }
    }
  }
}
