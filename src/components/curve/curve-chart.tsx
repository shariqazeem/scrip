import type { CurveShape } from "@/lib/curve/shape";

const W = 720;
const H = 300;
const PAD = { l: 18, r: 18, t: 34, b: 30 };

const hhmm = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 16);
const amount = (v: number) => (v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2));

/**
 * THE CURVE, AS A CHART — drawn on the server from the chain: the whole price path a launch's config
 * fixes, the part already filled in the accent, every real trade as a dot where it left the curve,
 * and where the curve is now. No axis of prices: the shape is the point, and a number for a
 * speculative token's price is the one thing Scrip never prints. The market's own chart, from
 * GeckoTerminal, is one link away.
 */
export function CurveChart({ shape, stockName, symbol, migrated, liveChart }: { shape: CurveShape; stockName: string; symbol: string; migrated: boolean; liveChart: string }) {
  const { points, now, marks, threshold } = shape;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const x = (q: number) => PAD.l + (Math.min(q, threshold) / (threshold || 1)) * (W - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const line = (ps: readonly { quote: number; price: number }[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.quote).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const filledPts = [...points.filter((p) => p.quote < now.quote), now];
  const filled = line(filledPts);
  const base = (H - PAD.b).toFixed(1);
  const area = `${filled} L${x(now.quote).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
  const label = `${symbol}'s curve: ${marks.length} trade${marks.length === 1 ? "" : "s"} on chain, ${migrated ? "graduated to Meteora DAMM v2" : `${amount(now.quote)} of ${amount(threshold)} ${stockName} in, ${Math.floor((now.quote / (threshold || 1)) * 100)}% of the way to graduation`}.`;

  return (
    <figure className="sp-cv-chart">
      <figcaption className="head">
        <span className="t">The curve</span>
        <a className="live" href={liveChart} target="_blank" rel="noreferrer">
          Live chart on GeckoTerminal
        </a>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <title>{label}</title>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="grid" x1={x(threshold * f)} x2={x(threshold * f)} y1={PAD.t} y2={H - PAD.b} />
        ))}
        <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
        <path className="area" d={area} />
        <path className="whole" d={line(points)} />
        <path className="filled" d={filled} />
        <line className="goal" x1={x(threshold)} x2={x(threshold)} y1={PAD.t - 12} y2={H - PAD.b} />
        <text className="goal-label" x={x(threshold) - 6} y={PAD.t - 18} textAnchor="end">
          {migrated ? "graduated" : "graduates here"}
        </text>
        {marks.map((m, i) => {
          // A label near either edge reads inward, so the graduation line and the frame never cut it.
          const cx = x(m.quote);
          const edge = cx > W - PAD.r - 40 ? "end" : cx < PAD.l + 40 ? "start" : "middle";
          const lx = edge === "end" ? cx - 12 : edge === "start" ? cx + 12 : cx;
          const ly = edge === "middle" ? y(m.price) + (i % 2 === 0 ? -12 : 20) : y(m.price) + 18;
          return (
            <g key={m.sig} className={`mark ${m.side}`}>
              <circle cx={cx} cy={y(m.price)} r={5} />
              {marks.length <= 12 ? (
                <text className="mark-label" x={lx} y={ly} textAnchor={edge}>
                  {m.side === "sell" ? "sell " : ""}
                  {hhmm(m.at)}
                </text>
              ) : null}
            </g>
          );
        })}
        <circle className="now" cx={x(now.quote)} cy={y(now.price)} r={7} />
      </svg>
      <div className="axis-labels" aria-hidden>
        <span>0</span>
        <span>
          {amount(threshold)} {stockName} in the curve
        </span>
      </div>
      <p className="note">
        {migrated
          ? `Each dot is a real trade on the curve, at its time in UTC. Full at ${amount(threshold)} ${stockName}, it graduated to a Meteora DAMM v2 pool, where it trades now: its market chart is on GeckoTerminal.`
          : `Price rises as ${stockName} flows in. Each dot is a real trade, at its time in UTC, placed where it left the curve; the large dot is now. At ${amount(threshold)} ${stockName} it graduates to a Meteora DAMM v2 pool.`}
      </p>
    </figure>
  );
}
