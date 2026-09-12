import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { WebgoldMark } from "@/components/brand/webgold-mark";
import "./content.css";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Webgold works: what the program holds, what it never holds, how inbound value becomes your mix, and the issuer facts that constrain all of it.",
};

/**
 * The docs are shell-exempt on purpose — see src/components/shell/routes.ts. A stranger
 * reading about custody should not be offered a rail link to "your book", which promises an
 * account they do not have.
 */
export default function DocsPage() {
  return (
    <main className="wg-doc">
      <Link href="/" className="wg-doc-brand" aria-label="Webgold home">
        <WebgoldMark size={20} />
        webgold
      </Link>

      <p className="wg-doc-eyebrow">Docs</p>
      <h1>What Webgold does, and what it refuses to do.</h1>
      <p className="lede">
        Webgold is a receive book for real assets on Solana. It settles value into ownership and
        writes a receipt anyone can open. It does not judge work, pick assets, or hold anything
        that is not under a rule.
      </p>

      <h2>The program holds a rule, not your assets</h2>
      <p>
        Your constituents sit in token accounts you own. The program holds two things: the mix
        policy you signed, and the receipts it emits. The single exception is an escrowed payout
        — value under a rule, on its way to a recipient — and it is released or returned, never
        kept.
      </p>
      <p>
        A pooled claim on a basket of tokenized securities would make this a fund. Direct
        ownership does not, and that distinction is load-bearing rather than cosmetic.
      </p>

      <h2>Nobody decides how much</h2>
      <p>
        Weights come from a policy you signed. Prices come from Pyth. Routing comes from Jupiter.
        Software executes a rule here; it never exercises discretion over someone&rsquo;s money.
        A payer may restrict which assets their payout can become — never the proportions.
      </p>

      <h2>Corporate actions, and why they are the hard part</h2>
      <p>
        Tokenized equities handle dividends and splits with an on-chain multiplier that rebases
        balances: the issuer publishes it before each ex-date and activates it shortly after.
        Store a raw balance and compute a return from it, and a reinvested dividend reads as a
        gain, a four-for-one split reads as a 300% return, and cost basis is silently wrong from
        that day forward.
      </p>
      <p>
        Webgold stores multiplier-adjusted quantity and cost basis, reconciles on every
        multiplier change, and publishes the reconciliation as a receipt like any other money
        moment.
      </p>

      <h2>The things we say before you ask</h2>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>Self-custody here means not our custody.</strong> Tokenized equity mints carry
          an issuer permanent delegate and a pause authority. The issuer can transfer, burn or
          freeze them. Webgold never holds your assets and cannot promise that nobody can touch
          them.
        </p>
      </div>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>There is no equity income on chain.</strong> Dividends are reinvested through
          a mint-level multiplier rather than paid as cash, so Webgold will never show you an
          expected dividend or a yield you have not received.
        </p>
      </div>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>Gold is metal or it is not gold.</strong> A fund share that tracks bullion is
          never displayed under grams. If it is listed at all it sits under funds and says so.
          Silver was held to the same test and did not pass it: every silver token on Solana is
          a fund tracker or a mining company, so silver is not a sleeve here.
        </p>
      </div>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>Savings-grade, not stable.</strong> Gold and equities fall as well as rise.
          Webgold is not a dollar substitute and does not present itself as one.
        </p>
      </div>

      <h2>The receipt</h2>
      <p>
        Every money moment writes an account on chain carrying the payer, the recipient, the
        amounts mint by mint, the gram-equivalent at the price stamp, the reason, and the release
        it belonged to. It is readable by anyone at{" "}
        <span className="mono">/receipt/&lt;signature&gt;</span>, forever, whether or not Webgold
        is still here. The database is a cache; the chain is the memory.
      </p>

      <p>
        <Link href="/assets">What a book can hold</Link> ·{" "}
        <Link href="/ledger">The public record</Link>
      </p>
    </main>
  );
}
