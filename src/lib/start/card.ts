import "server-only";

import { defaultAsset, offeredAssets } from "@/lib/assets/registry";
import { prices as jupPrices } from "@/lib/jupiter/client";
import { solUsd } from "@/lib/market";
import { waitedFor } from "@/lib/pyth/price";
import { priceStates } from "@/lib/pyth/ready";
import { powersSentence, stockByMint } from "@/lib/save/catalogue";
import { cluster } from "@/lib/solana/cluster";

/** A stock every payment can save into, as the start card shows it. */
export type StartStock = {
  readonly mint: string;
  readonly name: string;
  readonly ticker: string;
  readonly decimals: number;
  /** Who issues it and what its mint lets them do: said on the card, before anyone signs. */
  readonly issuerLine: string;
  /** Whether an automatic save could settle against this stock right now; null when unknown. */
  readonly ready: boolean | null;
  /** When it cannot: how long since the chain's newest price, in words. */
  readonly waited: string | null;
  /** Jupiter's price, for the worked example only; a save settles against Pyth. */
  readonly perUnitUsd: number | null;
};

export type StartCardProps = {
  readonly stocks: readonly StartStock[];
  readonly defaultMint: string;
  readonly solUsd: number | null;
  readonly cluster: string;
};

/**
 * EVERYTHING THE START CARD NEEDS, read once per page: the stocks a rule can price (the
 * default first), whether each could settle an automatic save now, and the issuer's line.
 */
export async function startCardProps(): Promise<StartCardProps> {
  const def = defaultAsset();
  const assets = [...offeredAssets()].filter((a) => stockByMint(a.mint)).sort((a, b) => Number(b.mint === def.mint) - Number(a.mint === def.mint));
  const [states, p, sol] = await Promise.all([priceStates(assets), jupPrices(assets.map((a) => a.mint)).catch(() => null), solUsd().catch(() => null)]);
  const priceOf = p && p.ok ? p.value : new Map<string, number>();
  return {
    stocks: assets.map((a, i) => {
      const s = stockByMint(a.mint)!;
      const st = states[i]!;
      return {
        mint: a.mint,
        name: s.name,
        ticker: s.ticker,
        decimals: s.decimals,
        issuerLine: `Issued by ${s.issuer.name}. ${powersSentence(s.powers)}`,
        ready: st.ready,
        waited: st.ready === false ? (waitedFor(st.lastAt) ?? "days") : null,
        perUnitUsd: priceOf.get(a.mint) ?? null,
      };
    }),
    defaultMint: def.mint,
    solUsd: sol,
    cluster: cluster(),
  };
}
