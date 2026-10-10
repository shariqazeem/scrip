import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Layers, Receipt, Repeat } from "lucide-react";
import { ConnectWallet } from "@/components/auth/connect";
import { AskForMatch } from "@/components/receipt/share";
import { unitsText } from "@/components/save/types";
import { short, usd, usdc } from "@/lib/format";
import type { StockHolding } from "@/lib/save/holdings";
import { worthOf } from "@/lib/save/holdings";
import type { SavingsTotals } from "@/lib/save/totals";
import "./savings-home.css";

/**
 * YOUR SAVINGS, THE FIRST SCREEN — what you own, then the one next step.
 *
 * A person arrives here from a receipt, the nav or a bookmark, and the first two questions are
 * "what do I have" and "what now". The rule's machinery (the live register, the ghost stub,
 * the watching line) follows below for whoever has turned saving every payment on.
 */

/** Signed out: what this place is, the one way in, and the way to start if you are new. */
export function SignInPanel({ lead }: { lead?: ReactNode }) {
  return (
    <div className="sp-signin">
      <section className="sp-signin-card" aria-label="Sign in">
        <p className="sp-signin-lead">
          {lead ?? "Sign in with the Solana wallet you save from. It is a signature, not a transaction: nothing moves, and it costs nothing."}
        </p>
        <ConnectWallet />
        <p className="sp-signin-new">New to Scrip? Start below: one approval, and your first stock lands in seconds.</p>
      </section>
      <section className="sp-signin-inside" aria-labelledby="inside">
        <p id="inside" className="sp-signin-k">
          What you will find here
        </p>
        <ul>
          <li>
            <Layers size={16} strokeWidth={2} aria-hidden />
            <span>
              <strong>Every stock you own</strong>
              In your own wallet, with what it is worth today.
            </span>
          </li>
          <li>
            <Receipt size={16} strokeWidth={2} aria-hidden />
            <span>
              <strong>Every save, with its receipt</strong>
              Saved now or saved automatically, each a public page built from the transaction.
            </span>
          </li>
          <li>
            <Repeat size={16} strokeWidth={2} aria-hidden />
            <span>
              <strong>Saving every payment</strong>
              On or off, how much, and what is left of your limit. Stop any time.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

/** What this wallet owns, worth today at Jupiter's price, and what was saved or added to get here. */
export function SavingsHead({ holdings, totals, why }: { holdings: readonly StockHolding[]; totals: SavingsTotals; why: string | null }) {
  if (why) {
    return (
      <section className="sp-sv" aria-label="What you own">
        <p className="sp-sv-empty">Your wallet could not be read just now, so nothing is shown rather than a wrong number. Your stock is safe in your wallet; try again in a moment.</p>
      </section>
    );
  }
  if (holdings.length === 0) {
    // Saved before, and the stock has since left this wallet: say that, beside what was saved,
    // rather than a blank space or a zero that reads like a loss.
    if (totals.savedUsdc === 0n && totals.addedUsdc === 0n) return null;
    return (
      <section className="sp-sv" aria-label="What you own">
        <div className="sp-sv-sum is-flat">
          <div>
            <p className="sp-sv-k">In this wallet now</p>
            <p className="sp-sv-big is-quiet">No stocks</p>
            <p className="sp-sv-note">What was saved here has moved out of this wallet. Every save still has its receipt below.</p>
          </div>
          <SumFacts totals={totals} />
        </div>
      </section>
    );
  }
  const worth = worthOf(holdings);
  return (
    <section className="sp-sv" aria-label="What you own">
      <div className="sp-sv-sum">
        <div>
          <p className="sp-sv-k">Worth today</p>
          <p className="sp-sv-big">{usd(worth.usd)}</p>
          <p className="sp-sv-note">
            At Jupiter&rsquo;s price right now{worth.unpriced > 0 ? `, leaving out ${worth.unpriced} it cannot price` : ""}. Stocks go down as well as up.
          </p>
        </div>
        <SumFacts totals={totals} />
      </div>
      <ul className="sp-sv-list" aria-label="Your stocks">
        {holdings.map((h) => (
          <li key={h.stock.mint}>
            <span className="nm">
              {h.stock.name}
              <span className="tk">
                {h.stock.ticker}, {h.stock.issuer.name}
              </span>
            </span>
            <span className="u">{unitsText(h.raw, h.stock.decimals)}</span>
            <span className="v">{h.usdValue !== null ? usd(h.usdValue) : "no price now"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SumFacts({ totals }: { totals: SavingsTotals }) {
  return (
    <dl className="sp-sv-facts">
      <div>
        <dt>Saved with Scrip</dt>
        <dd>{usdc(totals.savedUsdc)}</dd>
      </div>
      {totals.addedUsdc > 0n ? (
        <div>
          <dt>Added for you</dt>
          <dd className="is-added">{usdc(totals.addedUsdc)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

type Step = { readonly key: string; readonly title: string; readonly done: boolean; readonly doneLine: ReactNode; readonly todo: ReactNode; readonly action: ReactNode };

/**
 * YOUR NEXT STEP — after starting, what is left: saving every payment (done the moment the
 * start card ran) and asking whoever pays you to add to it. Saving once stopped being a step
 * of its own on 8 October, when the start card began making the first save in the same
 * approval. Each step is read from the chain, never ticked by hand; only the next carries a
 * button; gone once both are done.
 */
export function FirstSteps({
  owner,
  totals,
  hasRecord,
  automaticNote,
  inPlan = false,
}: {
  owner: string;
  totals: SavingsTotals;
  hasRecord: boolean;
  automaticNote: string | null;
  /** In a sponsor's Plan: whoever pays them already adds to what they save. */
  inPlan?: boolean;
}) {
  // Saving once is part of starting now (the start card), so it is no longer a step of its own.
  const steps: Step[] = [
    {
      key: "every",
      title: "Save every payment",
      done: hasRecord,
      doneLine: "Set up. Whatever it is doing right now is just below.",
      todo: (
        <>
          Say yes once, and 10% of every USDC payment into this wallet is saved the same way, by itself. Scrip can move at most $200, and you can stop
          any time.{automaticNote ? ` ${automaticNote}` : ""}
        </>
      ),
      action: (
        <Link href="/app/rule" className="sp-action is-primary">
          Save 10% of every payment
        </Link>
      ),
    },
    {
      key: "ask",
      title: "Ask whoever pays you to add to it",
      done: totals.added > 0 || inPlan,
      doneLine: inPlan ? "You are in a Plan: every automatic save is matched, up to its monthly cap." : "Someone has added stock to your savings. Every time, the receipt says who and why.",
      todo: "A message for whoever pays you in USDC, with a link that shows them how to add stock to what you save, in one signature.",
      action: <AskForMatch from={short(owner)} className="sp-action is-primary" label="Share the message" />,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="sp-steps" aria-labelledby="first-steps">
      <div className="sp-steps-head">
        <h2 id="first-steps">Your first steps</h2>
        <span>
          {done} of {steps.length} done
        </span>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? "is-done" : i === next ? "is-now" : "is-later"}>
            <span className="mark" aria-hidden>
              {s.done ? <Check size={16} strokeWidth={2.4} /> : i + 1}
            </span>
            <div className="body">
              <p className="t">
                {s.title}
                {s.done ? <span className="sr-only">, done</span> : null}
              </p>
              <p className="p">{s.done ? s.doneLine : s.todo}</p>
              {i === next ? <div className="act">{s.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * MORE WAYS STOCK REACHES YOU — the front door's three ways, from inside your savings: whoever
 * pays you can match what you save, launches on the launchpad fund those matches, and you can pay
 * someone else in stock. Always shown, so nothing Scrip does is more than one tap from home.
 */
export function MoreWays({ from }: { from: string }) {
  return (
    <section className="sp-more-ways" aria-labelledby="more-ways">
      <h2 id="more-ways">More ways stock reaches you</h2>
      <div className="grid">
        <Link href={`/teams?${new URLSearchParams({ from })}`} className="way">
          <span className="t">Whoever pays you can match it</span>
          <span className="p">A Plan adds a share of every automatic save, in stock, capped each month. Show them how.</span>
        </Link>
        <Link href="/curve" className="way">
          <span className="t">Launches that pay savers</span>
          <span className="p">Tokens launched on the launchpad send part of every trading fee into Plans that match automatic saves.</span>
        </Link>
        <Link href="/app/org" className="way">
          <span className="t">Pay someone in stock</span>
          <span className="p">One person or a whole team, from your wallet, with a receipt that says why.</span>
        </Link>
      </div>
    </section>
  );
}
