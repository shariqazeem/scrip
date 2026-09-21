import type { Metadata } from "next";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";

export const metadata: Metadata = { title: "Changelog", description: "What shipped, when, in the order it was built." };

const LOG: ReadonlyArray<{ date: string; items: readonly string[] }> = [
  {
    date: "16 Sep 2026",
    items: [
      "Grants: stock bought now that vests on a schedule, from anyone to anyone. Five new instructions; a receipt at seal and at every vest; keepers vest on a cadence.",
      "Organisations: a handle of kind org; pay one with a split; runs that sign once for a whole team, with a run page; a public page that lists everyone paid.",
      "The floor: the live tape over server-sent events, the clock with the share of arrivals that settled while the NYSE was shut, keepers, corporate actions on stage.",
      "The register: holdings with vesting grants, every receipt filterable and exportable, monthly statements that print, settings for allowance and float, Telegram when a stub prints.",
      "Receipt kinds renamed: sweep, pay, gift, grant, vest. Run ids on receipts. The wordmark set in Fraunces.",
    ],
  },
  {
    date: "15 Sep 2026",
    items: [
      "The front door as a film: dark opening, the printer, the last sweep replayed from its receipt, the market band with rolling figures, a perforated tear into paper.",
      "The rule page asks its one question before any wallet; one signature opens, approves, floats and enables.",
      "Two ways to pay: in stock, or in USDC to the normal address. A public page per register, opt-in. The keepers page.",
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
