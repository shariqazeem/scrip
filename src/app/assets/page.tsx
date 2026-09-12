import type { Metadata } from "next";
import { Gift, Info, ShieldAlert, Snowflake } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";
import { ClaimButton } from "@/components/app/claim-button";
import { readSponsored } from "@/lib/book/read-sponsorships";
import { currentOwner } from "@/lib/session/server";
import { fromBase, grams, short, usd } from "@/lib/format";
import {
  ASSETS,
  type Asset,
  DEFAULT_POLICY_BPS,
  GRAMS_PER_TROY_OUNCE,
  SILVER_FINDING,
} from "@/lib/assets/registry";
import { bps } from "@/lib/format";
import { explorerUrl } from "@/lib/solana/cluster";

export const metadata: Metadata = {
  title: "Assets",
  description:
    "What a Webgold book can hold, with the issuer, the wrapper and the issuer powers named on every row. Gold is metal; a fund share that tracks metal is labelled a fund share.",
};

const UNIT_LABEL: Record<Asset["unit"], string> = {
  gram: "fine grams",
  "troy-ounce": "troy ounces",
  share: "share-equivalents",
  "fund-share": "fund shares",
  dollar: "dollars",
};

const KIND_LABEL: Record<Asset["kind"], string> = {
  metal: "allocated metal",
  equity: "equity tracker",
  fund: "fund share",
  cash: "cash",
};

const defaultBps = new Map(DEFAULT_POLICY_BPS.map((l) => [l.symbol, l.bps]));

/**
 * THE EXPLORE SURFACE — and the page where the product's honesty is either real or theatre.
 *
 * Every row names the issuer, the wrapper, and what the token is actually a claim on. The
 * facts on each row were read off the mint account itself (2026-09-12), not copied from a
 * docs page, which is why the disclosures differ per row instead of being one banner: Oro
 * GOLD has no freeze authority and no permanent delegate, and SPYx has both. A blanket
 * warning would be false about the gold and is the kind of lazy honesty that reads as
 * dishonesty the moment somebody checks.
 *
 * No price renders here. Prices come from the valuer (build-order step 2), and until they do,
 * a number on this page would be one we cannot derive from chain state.
 */
export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const [owner, sponsored] = await Promise.all([currentOwner(), readSponsored()]);

  return (
    <PageFrame
      eyebrow="Assets"
      title="What a book can hold, and whose token it is."
      sub="Read from the mint accounts themselves, not from a docs page. Where an issuer can move, burn or freeze a token, the row says so."
    >
      <div className="wg-stack">
        <p className="wg-finding">
          <Info size={16} strokeWidth={2} aria-hidden />
          <span>
            <strong>Why there is no silver sleeve.</strong> {SILVER_FINDING} The rule that
            stops a gold fund being called a gram stops a silver fund being called an ounce.
          </span>
        </p>

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Sponsored first positions</span>
            <span className="mono">first come, one per wallet</span>
          </div>
          {!sponsored.ok ? (
            <EmptyState
              icon={<Gift size={22} strokeWidth={1.6} />}
              title="Sponsored positions could not be read just now"
              note={sponsored.why}
            />
          ) : sponsored.value.length === 0 ? (
            <EmptyState
              icon={<Gift size={22} strokeWidth={1.6} />}
              title="Nobody is sponsoring a first position right now"
              note="An issuer funds grams into a book that does not exist yet, and whoever claims it becomes the holder. When one is open it appears here — real, claimable, and never a placeholder."
            />
          ) : (
            <div className="wg-rows">
              {sponsored.value.map((s) => (
                <article key={s.address} className="wg-row">
                  <div className="wg-row-id">
                    <span className="wg-row-sym">
                      {Number(s.gramsE8) > 0
                        ? grams(Number(s.gramsE8) / 1e8)
                        : usd(fromBase(s.valueBase, 6))}
                    </span>
                    <span className="wg-row-name">{s.legs.map((l) => l.symbol).join(" · ")}</span>
                    <span className="mono wg-row-issuer">from {short(s.sponsor)}</span>
                  </div>
                  <p className="wg-row-issuer">
                    {s.reason}
                    <br />
                    Worth {usd(fromBase(s.valueBase, 6))} at the stamp it was funded with. It
                    lands in your own wallet, and nobody has to decide to become an investor
                    first.
                  </p>
                  <div className="wg-row-meta">
                    <ClaimButton
                      owner={owner}
                      sponsor={s.sponsor}
                      nonce={s.nonce}
                      releaseIdHex={s.releaseId}
                      legs={s.legs.map((l) => ({ mint: l.mint }))}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Eligible mints</span>
            <span className="mono">
              default mix ·{" "}
              {DEFAULT_POLICY_BPS.map((l) => `${l.symbol} ${bps(l.bps)}`).join(" · ")}
            </span>
          </div>
          <div className="wg-rows">
            {ASSETS.map((a) => (
              <article key={a.mint} className="wg-row">
                <div className="wg-row-id">
                  <span className="wg-row-sym">{a.symbol}</span>
                  <span className="wg-row-name">{a.name}</span>
                  <a
                    className="mono wg-row-issuer"
                    href={explorerUrl("address", a.mint, "mainnet-beta")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.mint.slice(0, 8)}…{a.mint.slice(-6)}
                  </a>
                </div>

                <p className="wg-row-issuer">
                  <a href={a.issuer.url} target="_blank" rel="noreferrer">
                    {a.issuer.name}
                  </a>
                  <br />
                  {a.issuer.wrapper}
                </p>

                <div className="wg-row-meta">
                  {defaultBps.has(a.symbol) ? (
                    <span className="wg-chip is-unit">default {bps(defaultBps.get(a.symbol)!)}</span>
                  ) : null}
                  <span className="wg-chip">{KIND_LABEL[a.kind]}</span>
                  <span className="wg-chip">{UNIT_LABEL[a.unit]}</span>
                  <span className="wg-chip">{a.decimals} dp</span>
                  {a.hasMultiplier ? <span className="wg-chip">rebases</span> : null}
                  {a.permanentDelegate ? (
                    <span className="wg-chip is-caution">
                      <ShieldAlert size={11} strokeWidth={2.2} aria-hidden />
                      permanent delegate
                    </span>
                  ) : null}
                  {a.freezable ? (
                    <span className="wg-chip is-caution">
                      <Snowflake size={11} strokeWidth={2.2} aria-hidden />
                      freezable
                    </span>
                  ) : null}
                </div>

                <p className="wg-row-disclosure">{a.disclosure}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">How a quantity is counted</span>
          </div>
          <div className="wg-panel-body">
            <p className="wg-page-sub" style={{ marginTop: 0 }}>
              One troy ounce is <span className="mono">{GRAMS_PER_TROY_OUNCE}</span> fine grams,
              so a book that holds allocated metal can say grams without the token pretending to
              be one. A tracker that rebases carries a mint-level multiplier: every quantity
              shown in Webgold is the raw balance through that multiplier, and every cost basis
              is the dollars actually contributed. That is what stops a reinvested dividend
              reading as a gain and a four-for-one split reading as a 300% return.
            </p>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
