import type { CurveShape } from "@/lib/curve/shape";

const W = 240;
const H = 64;
const P = 4;

/**
 * A LAUNCH'S CURVE, SMALL — for the launch board: the price path its config fixes, the part already
 * filled, and every real trade as a dot. Drawn on the server from the same `CurveShape` as the
 * launch's own chart; no axis and no price, as there.
 */
export function CurveSpark({ shape, label }: { shape: CurveShape; label: string }) {
  const { points, now, marks, threshold } = shape;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const x = (q: number) => P + (Math.min(q, threshold) / (threshold || 1)) * (W - 2 * P);
  const y = (p: number) => P + (1 - (p - lo) / (hi - lo || 1)) * (H - 2 * P);
  const path = (ps: readonly { quote: number; price: number }[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.quote).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const filledPts = [...points.filter((p) => p.quote < now.quote), now];
  const base = (H - P).toFixed(1);
  const area = `${path(filledPts)} L${x(now.quote).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
  return (
    <svg className="sp-cvh-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      <path className="whole" d={path(points)} />
      <path className="area" d={area} />
      <path className="filled" d={path(filledPts)} />
      {marks.map((m) => (
        <circle key={m.sig} className={m.side === "sell" ? "mark is-sell" : "mark"} cx={x(m.quote)} cy={y(m.price)} r={2.5} />
      ))}
    </svg>
  );
}
