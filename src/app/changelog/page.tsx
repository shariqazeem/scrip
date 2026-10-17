import type { Metadata } from "next";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";

export const metadata: Metadata = { title: "Changelog", description: "What shipped, when, in the order it was built." };

const LOG: ReadonlyArray<{ date: string; items: readonly string[] }> = [
  {
    date: "17 Oct 2026",
    items: [
      "Automatic saves around the clock, weekends included, for the S&P 500, the Nasdaq 100, Nvidia, Alphabet, Tesla, Meta, Apple and Amazon: each now settles against the token's own 24/7 Pyth price, which Pyth keeps fresh on chain, fully verified. Gold saves on weekdays, while its market trades.",
      "Microsoft and MicroStrategy leave every payment, because no verified price for them is fresh on chain; both stay in Save now.",
      "The demo wallet of 13 October is counted as the team's, so no count of savers outside the team includes the founder.",
    ],
  },
  {
    date: "10 Oct 2026",
    items: [
      "The launchpad, on Meteora: launch a token priced in the Nasdaq 100, the S&P 500, Tesla or Nvidia from your own wallet in one approval; buy with USDC, sell for the stock; graduate a full curve from its page. The savers' share of every trading fee is claimed straight into a Scrip Plan in that stock.",
      "The first launch: a demonstration priced in the Nasdaq 100, launched, filled and graduated to a Meteora DAMM v2 pool on mainnet in one morning; every fee it charged, four claims, into the Nasdaq 100 Plan.",
      "Every launch's page draws its curve from the chain: the price path its settings fix, each real trade as a dot, and where it graduates; a link to the market's own chart.",
      "The front door says the whole of it: three ways stock reaches you, every payment, whoever pays you, every launch, each with what is on mainnet now. Launchpad on every nav; four groups in the app's rail; the section pill follows you.",
    ],
  },
  {
    date: "9 Oct 2026",
    items: [
      "Starting saves your last payment: one approval opens your savings record, sets the limit and saves part of the payment you already received, by itself, seconds later. On mainnet, 16 seconds from the approval to stock.",
      "A match shows on the save's own receipt, in green, linked to its own transaction; the register's stubs carry it too.",
      "A sponsor adds to a Plan's escrow from USDC in one signature; savers can ask to join Scrip's own Plan from their savings page.",
      "Stop and take back your SOL: one signature turns saving off and returns the record's deposits and every prepaid save not used.",
      "Your savings leads with named facts: status, last automatic save, what Scrip can still move, what is prepaid; and See it work now.",
    ],
  },
  {
    date: "8 Oct 2026",
    items: [
      "Plans on mainnet: the program upgraded (617,552 bytes, verified byte for byte against the chain) with open_plan, add_member, accept_member, remove_member, match_receipt and close_plan. The first match landed ten seconds after a save.",
      "One card, one approval: how much of every payment, into which stock, and a first save, in one transaction.",
      "Your savings is the first screen: what the wallet owns, saved with Scrip and added for you, your first steps, then the live record. Five labelled tabs on a phone.",
      "The Nasdaq 100 is the default stock, because it is the one an automatic save can settle today; the S&P 500 stays one tap away.",
    ],
  },
  {
    date: "7 Oct 2026",
    items: [
      "Save now: a Jupiter swap from your USDC into any of 106 tokenized stocks from xStocks, Ondo and Backpack, with a receipt read from the transaction, at any hour.",
      "Amounts in the money you spend: the currency from your time zone, the daily rate named on every converted amount.",
      "The old front door moved to /proof, on ink; the machine's words stay there.",
    ],
  },
  {
    date: "24 Sep 2026",
    items: [
      "The first automatic save on mainnet: $5 landed, 20% became 0.0013 S&P 500 ten seconds later, filled 0.02% from the Pyth price it was checked against.",
      "Every receipt shows the price it settled against, the fill against it, the seconds from money to stock, and what the save cost.",
      "A new wallet can start without ever having held USDC: the account is opened in the same signature.",
    ],
  },
  {
    date: "21 Sep 2026",
    items: [
      "Scrip on Solana mainnet at scrip.work: the program deployed (2.9785 SOL, measured), dumped back and compared byte for byte; two independent saving services; receipts measured at 7 and 30 days.",
    ],
  },
  {
    date: "16 Sep 2026",
    items: [
      "Grants: stock bought now that vests on a schedule, from anyone to anyone. Five new instructions; a receipt at seal and at every vest; it vests on its own every day.",
      "Organisations: a handle of kind org; pay one with a split; runs that sign once for a whole team, with a run page; a public page that lists everyone paid.",
      "The floor: the live tape over server-sent events, the clock with the share of arrivals that settled while the NYSE was shut, corporate actions on stage.",
      "The register: holdings with vesting grants, every receipt filterable and exportable, monthly statements that print, settings for allowance and float, Telegram when a stub prints.",
      "Receipt kinds renamed: sweep, pay, gift, grant, vest. Run ids on receipts. The wordmark set in Fraunces.",
    ],
  },
  {
    date: "15 Sep 2026",
    items: [
      "The front door as a film: dark opening, the printer, the last sweep replayed from its receipt, the market band with rolling figures, a perforated tear into paper.",
      "The rule page asks its one question before any wallet; one signature opens, approves, floats and enables.",
      "Two ways to pay: in stock, or in USDC to the normal address. A public page per register, opt-in.",
      "The program built at opt-level z: 498,480 bytes, about 2.5 SOL of rent. Devnet stand-ins labelled as such on every surface.",
      "Webgold became Scrip: the rule, the intake, the sweep atomic without a Jupiter CPI, Pyth-bounded fills, receipts measured at 7 and 30 days, keep-rate.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <SiteFrame eyebrow="Changelog" title="What shipped." lede="In the order it was built. Every line here is something that runs.">
      {LOG.map((day) => (
        <SiteSection key={day.date} label={day.date}>
          <div className="sp-truths">
            {day.items.map((it, i) => (
              <Row key={i} k={String(i + 1).padStart(2, "0")}>
                {it}
              </Row>
            ))}
          </div>
        </SiteSection>
      ))}
    </SiteFrame>
  );
}
