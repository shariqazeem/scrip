import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { DEPLOYED } from "@/lib/curve/deployed";
import { PRESET, THRESHOLD_USDC, VAULT_SHARES } from "@/lib/curve/preset";
import { readLaunches, readVault } from "@/lib/curve/read";
import { short, usd } from "@/lib/format";
import { explorerUrl } from "@/lib/solana/cluster";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scrip Curve",
  description: "A Meteora launch preset whose trading fees become real people's savings, through Meteora's own Dynamic Fee Sharing: 90% to a savings pool that buys stock for savers, 10% to Scrip.",
};

const REPO = "https://github.com/shariqazeem/scrip/blob/main";

/**
 * /CURVE — the Meteora entry, off the main nav.
 *
 * A launch preset on Dynamic Bonding Curve whose fee claimer is a Dynamic Fee Sharing vault,
 * so every trade's partner fee, the migration fee and the locked partner position's fees after
 * graduation all land in one vault: 90 to the Savings Pool, 10 to Scrip. The Savings Pool
 * turns its share into stock in savers' wallets. The page reads the vault and every launch
 * from the chain, says what has been checked and what has not happened yet, and makes no
 * claim about any launch's price.
 */
export default async function CurvePage() {
  const [vault, launches] = await Promise.all([readVault(), readLaunches()]);
  const configs = Object.entries(DEPLOYED.configs);
  return (
    <SiteFrame
      eyebrow="Scrip Curve"
      title="Launches that fund savings."
      lede="A launch preset on Meteora's Dynamic Bonding Curve whose fees become real people's savings. Every trade's partner fee goes, through Meteora's own Dynamic Fee Sharing, into one vault: 90% to the Savings Pool, which buys stock into savers' wallets, and 10% to Scrip."
    >
      <SiteSection label="The money trail">
        <div className="sp-truths">
          <Row k="1. A trade">
            Someone buys or sells a token launched on the Scrip Curve config. The curve charges its fee in USDC: half to the launcher, half to the
            config&rsquo;s fee claimer, after Meteora&rsquo;s own share.
          </Row>
          <Row k="2. The fee claimer is a vault">
            The config&rsquo;s fee claimer is a Dynamic Fee Sharing vault, a program address under Meteora&rsquo;s program. Its recipients are fixed for
            good: the Savings Pool {VAULT_SHARES.savingsPool / 100}%, Scrip {VAULT_SHARES.scrip / 100}%.
          </Row>
          <Row k="3. Claimed by integration">
            Meteora&rsquo;s <span className="mono">fund_by_claiming_fee</span> calls the curve&rsquo;s own <span className="mono">claim_trading_fee</span> with the vault as
            signer, so the fee goes from the pool to the vault and no wallet holds it in between. After graduation, the same for the migration fee and the
            locked partner position&rsquo;s fees on DAMM v2.
          </Row>
          <Row k="4. Into savings">
            The Savings Pool takes its share and pays it to savers as stock, through Scrip&rsquo;s pay in stock: the S&amp;P 500, in their own wallet.
          </Row>
          <Row k="5. A receipt that names the launch">Every payment funded this way says which launch paid for it and links the claim transaction.</Row>
        </div>
      </SiteSection>

      <SiteSection label="Live, from the chain">
        {vault ? (
          <div className="sp-truths">
            <Row k="The vault">
              <a href={explorerUrl("address", vault.address)}>{short(vault.address)}</a>: {usd(vault.fundedUsdc)} of fees received, {usd(vault.claimedUsdc)} taken by
              its recipients, {usd(vault.waitingUsdc)} waiting.
            </Row>
            {vault.recipients.map((r) => (
              <Row key={r.address} k={r.role}>
                <a href={explorerUrl("address", r.address)}>{short(r.address)}</a>: {usd(r.totalUsdc)} earned, {usd(r.takenUsdc)} taken.
              </Row>
            ))}
            {configs.map(([kind, c]) => (
              <Row key={kind} k={`The ${kind} config`}>
                <a href={explorerUrl("address", c.address)}>{short(c.address)}</a>, created in <a href={explorerUrl("tx", c.createdSig)}>{short(c.createdSig)}</a>.
              </Row>
            ))}
            {launches.map((l) => (
              <Row key={l.pool} k={`${l.name} (${l.symbol})`}>
                {l.kind === "demonstration" ? "A demonstration launch, never a Scrip token. " : ""}Pool <a href={explorerUrl("address", l.pool)}>{short(l.pool)}</a>
                {l.quoteReserveUsdc !== null ? `: ${usd(l.quoteReserveUsdc)} in the curve, ${usd(l.partnerFeeWaitingUsdc ?? 0)} of partner fees waiting to be claimed` : ""}
                {l.migrated ? ", graduated to DAMM v2" : ""}.
              </Row>
            ))}
          </div>
        ) : (
          <p className="sp-body">
            Nothing is on mainnet yet. The vault, the config and a demonstration launch are created by Scrip&rsquo;s founder with the open-source script
            below; this page reads them from the chain the moment they exist.
          </p>
        )}
      </SiteSection>

      <SiteSection label="The preset">
        <div className="sp-truths">
          <Row k="Quote">USDC. The fee vault takes one plain mint, and tokenized stocks carry extensions it refuses.</Row>
          <Row k="Fee">
            Starts at {PRESET.startingFeeBps / 100}% and falls to {PRESET.endingFeeBps / 100}% over the first hour, so a sniper pays the savers and a holder
            does not. Collected in USDC. The launcher keeps {PRESET.creatorTradingFeePercentage}% of the partner-side fee.
          </Row>
          <Row k="Graduation">
            To Meteora DAMM v2 at {THRESHOLD_USDC.public} USDC, where Meteora&rsquo;s keepers migrate on their own (a demonstration uses {THRESHOLD_USDC.demonstration}{" "}
            and the manual migrator). A {PRESET.migrationFeePercentage}% migration fee, half to the vault. The migrated pool collects its fees in USDC.
          </Row>
          <Row k="Liquidity">Every position locked for good at graduation: nobody can pull the pool, and the locked partner position keeps paying the vault.</Row>
          <Row k="Token">A plain SPL token with immutable metadata and no mint authority: nobody can mint more after launch.</Row>
          <Row k="No public form">Launches are by invitation, for sponsors of savers, so nobody can use Scrip&rsquo;s name to sell a token.</Row>
        </div>
      </SiteSection>

      <SiteSection label="What is checked, and what is not">
        <ul>
          <li>
            <strong>Checked from Meteora&rsquo;s own code, 7 October:</strong> a config&rsquo;s fee claimer can be the fee-sharing vault; at graduation the
            partner&rsquo;s DAMM v2 position goes to the fee claimer; the migration fee is withdrawn by the fee claimer. Details in{" "}
            <a href={`${REPO}/docs/decisions.md`}>the decision log</a>.
          </li>
          <li>
            <strong>Simulated on mainnet:</strong> creating the vault and both configs against Meteora&rsquo;s live programs.
          </li>
          <li>
            <strong>Not yet proven on mainnet:</strong> {DEPLOYED.launches.length > 0 ? "a fee that reached a saver's receipt." : "the vault, the config, a launch, and a fee that reached a saver's receipt."}
          </li>
        </ul>
      </SiteSection>

      <SiteSection label="How it differs">
        <p className="sp-body">
          Other stock launchpads pay their creators or their holders. This one pays savers outside the token, and claims nothing about price. Any
          launchpad can copy the savings route: the preset and the pipeline are open source in <a href={`${REPO}/src/lib/curve/preset.ts`}>preset.ts</a> and{" "}
          <a href={`${REPO}/scripts/curve.ts`}>curve.ts</a>.
        </p>
      </SiteSection>

      <SiteSection label="Before you trade a launch">
        <p className="sp-body">
          <strong>A launch is a speculative token. Scrip makes no claim about its price; it guarantees only where its fees go.</strong>
        </p>
        <p className="sp-body">
          <Link href="/proof">The rest of the proof</Link>
        </p>
      </SiteSection>
    </SiteFrame>
  );
}
