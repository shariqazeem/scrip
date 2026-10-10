import { ArrowDown } from "lucide-react";
import "./trail.css";

/**
 * THE MONEY TRAIL, DRAWN — the three places a launch fee passes through, in order, with the
 * instruction that moves it between each. The words are the page's own rows, shortened; nothing
 * here is a figure.
 */
const NODES = [
  { k: "A trade on the curve", v: "pays its fee in the stock it is priced in", n: "Meteora DBC" },
  { k: "Scrip Plan escrow", v: "the Plan's own account in that stock", n: "Scrip program" },
  { k: "A saver's wallet", v: "matched on their automatic save", n: "on their receipt" },
] as const;
const EDGES = ["claim_trading_fee, receiver = the Plan", "match_receipt, after each save"] as const;

export function MoneyTrail() {
  return (
    <figure className="sp-trail" aria-label="Where a launch fee goes">
      <ol className="sp-trail-row">
        {NODES.map((node, i) => (
          <li key={node.k} className="sp-trail-item">
            <div className={`sp-trail-node${i === 1 ? " is-plan" : i === 2 ? " is-saver" : ""}`}>
              <span className="n">{node.n}</span>
              <span className="k">{node.k}</span>
              <span className="v">{node.v}</span>
            </div>
            {i < EDGES.length ? (
              <div className="sp-trail-edge">
                <ArrowDown size={18} strokeWidth={2} aria-hidden />
                <span className="mono">{EDGES[i]}</span>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="sp-trail-after">
        <span className="n">After graduation</span>
        <span>
          Meteora DAMM v2 pool, launch token / stock, all liquidity locked. Its fees reach the same escrow with{" "}
          <span className="mono">claim_position_fee</span>, receiver = the Plan.
        </span>
      </div>
    </figure>
  );
}
