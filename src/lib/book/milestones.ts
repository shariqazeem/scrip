import type { LiveArrival, LiveView } from "./live-types";

/**
 * A SET-AND-FORGET PRODUCT IS FELT AT MOMENTS. Five of them, each derived from receipts
 * this register already holds, each dated by the receipt that crossed it, each with the
 * signature so a stranger can open the proof. Nothing here is a goal the owner was set, a
 * streak, or a score: a milestone is a fact that already happened, stated once.
 *
 * No confetti, no badge, no rank. The card is the stub with one line above it.
 */
export type MilestoneId = "first" | "whole-share" | "ten" | "thirty-days" | "thousand";

export type Milestone = {
  readonly id: MilestoneId;
  /** The line on the card and in the register. */
  readonly line: string;
  /** What it means, in one sentence. */
  readonly sub: string;
  /** When it was crossed, and the receipt that crossed it. */
  readonly atUnix: number;
  readonly sig: string;
};

/** What has not happened yet, said as arithmetic on what has. Never a projection. */
export type NextUp = {
  readonly line: string;
  readonly sub: string;
};

const WHOLE = "a whole share";

function sweepsAndPayments(view: LiveView): LiveArrival[] {
  return [...view.arrivals].sort((a, b) => a.settledUnix - b.settledUnix);
}

/** Arrivals in the register's own asset, which is the only one it can count in units. */
function inAsset(view: LiveView): LiveArrival[] {
  const mint = view.asset?.mint;
  return mint ? sweepsAndPayments(view).filter((a) => a.asset === mint) : [];
}

export function milestonesFor(view: LiveView): Milestone[] {
  const all = sweepsAndPayments(view);
  if (all.length === 0) return [];
  const out: Milestone[] = [];
  const first = all[0]!;
  out.push({ id: "first", line: "The first receipt.", sub: "The rule turned an arrival into stock for the first time.", atUnix: first.settledUnix, sig: first.sig });

  // The first whole share, in the register's own asset, counted in raw units.
  const asset = view.asset;
  const mine = inAsset(view);
  if (asset && asset.decimals !== null) {
    const one = 10n ** BigInt(asset.decimals);
    let running = 0n;
    for (const a of mine) {
      running += BigInt(a.amountRaw);
      if (running >= one) {
        out.push({ id: "whole-share", line: `One whole ${asset.symbol}.`, sub: `The receipts add up to a share of ${asset.name}, bought a slice at a time.`, atUnix: a.settledUnix, sig: a.sig });
        break;
      }
    }
  }

  if (all.length >= 10) {
    const tenth = all[9]!;
    out.push({ id: "ten", line: "Ten receipts.", sub: "Ten arrivals became stock without a decision.", atUnix: tenth.settledUnix, sig: tenth.sig });
  }

  // Thirty days kept: the first receipt whose 30-day measurement found the units still there.
  const kept = all.find((a) => a.measured30dAt > 0 && BigInt(a.measured30dRaw) >= BigInt(a.amountRaw));
  if (kept) out.push({ id: "thirty-days", line: "Thirty days, kept.", sub: "The chain measured the first receipt at thirty days and the units were still held.", atUnix: kept.measured30dAt, sig: kept.sig });

  let dollars = 0n;
  for (const a of all) {
    dollars += BigInt(a.paidUsdc);
    if (dollars >= 1_000_000_000n) {
      out.push({ id: "thousand", line: "A thousand dollars in stock.", sub: "What the rule has converted, at the prices on the receipts.", atUnix: a.settledUnix, sig: a.sig });
      break;
    }
  }
  return out.sort((a, b) => a.atUnix - b.atUnix);
}

/**
 * "At your average arrival, your next whole share is about N arrivals away." Arithmetic on
 * this register's own receipts: the average units a receipt has delivered, and how many
 * units are missing from the next whole share. It is labelled arithmetic wherever it is
 * shown, and it says nothing about price.
 */
export function nextWholeShare(view: LiveView): NextUp | null {
  const asset = view.asset;
  if (!asset || asset.decimals === null) return null;
  const mine = inAsset(view);
  if (mine.length === 0) return null;
  const one = 10n ** BigInt(asset.decimals);
  const total = mine.reduce((n, a) => n + BigInt(a.amountRaw), 0n);
  const avg = total / BigInt(mine.length);
  if (avg <= 0n) return null;
  const missing = one - (total % one);
  const arrivals = Number((missing + avg - 1n) / avg);
  const shares = Number(total / one);
  const which = shares === 0 ? `first whole ${asset.symbol}` : `${ordinal(shares + 1)} whole ${asset.symbol}`;
  return {
    line: arrivals <= 1 ? `The next arrival like your last ones completes your ${which}.` : `About ${arrivals.toLocaleString("en-US")} more arrivals complete your ${which}.`,
    sub: `Arithmetic on your own receipts: ${mine.length} receipt${mine.length === 1 ? "" : "s"} averaging ${fmtUnits(avg, asset.decimals)} ${asset.symbol}. Not a forecast; the next arrival may be any size, and ${WHOLE} may cost more or less.`,
  };
}

function fmtUnits(raw: bigint, decimals: number): string {
  const s = (Number(raw) / 10 ** decimals).toFixed(Math.min(decimals, 4));
  return s;
}

function ordinal(n: number): string {
  const names = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  if (n < names.length) return names[n]!;
  const rem100 = n % 100;
  const rem10 = n % 10;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : rem10 === 1 ? "st" : rem10 === 2 ? "nd" : rem10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export const MILESTONE_IDS: readonly MilestoneId[] = ["first", "whole-share", "ten", "thirty-days", "thousand"];

export function isMilestoneId(s: string): s is MilestoneId {
  return (MILESTONE_IDS as readonly string[]).includes(s);
}
