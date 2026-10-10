import data from "./deployed.json";
import type { CurveKind, CurveStock } from "./preset";

/**
 * WHAT SCRIP CURVE HAS ON CHAIN — the Plans every launch fee goes to (one per stock, because a
 * fee arrives in the stock its curve is priced in) and the launch configs (per stock, public and
 * demonstration), written back by `scripts/curve.ts` and checked in. Public keys and signatures
 * only: nothing secret ever goes in this file. Launches are not listed here: anyone can launch on
 * a config, so the chain is their list (`launches.ts`). The founder's own demonstration launches
 * are recorded too, with what the CLI saw, for the films.
 */
export type PlanRecord = {
  readonly address: string;
  readonly sponsor: string;
  /** Sixteen bytes, hex: the Plan's seed. */
  readonly planId: string;
  readonly escrow: string;
  readonly createdSig: string;
};

export type ConfigRecord = { readonly address: string; readonly createdSig: string };

export type Launch = {
  readonly name: string;
  readonly symbol: string;
  readonly kind: CurveKind;
  readonly stock: CurveStock;
  readonly config: string;
  readonly baseMint: string;
  readonly pool: string;
  readonly createdSig: string;
  readonly createdUnix: number;
  readonly migratedSig?: string;
  readonly dammPool?: string;
  /** The partner's locked DAMM v2 position and its NFT account, held by the fee claimer after graduation. */
  readonly partnerPosition?: string;
  readonly partnerPositionNftAccount?: string;
  /** The partner's share of the graduation fee, moved into the Plan once. */
  readonly migrationFeeSig?: string;
};

export type Deployed = {
  readonly cluster: string;
  /**
   * Who signs the fee claims: Scrip's saving service. Meteora lets the claimer choose where a fee
   * goes, and this one only ever sends it to the Plan of the curve's own stock.
   */
  readonly feeClaimer: string | null;
  readonly plans: Partial<Record<CurveStock, PlanRecord>>;
  readonly configs: Partial<Record<CurveStock, Partial<Record<CurveKind, ConfigRecord>>>>;
  readonly launches: readonly Launch[];
  /** The lookup table of the accounts every launch names (`table.ts`), made by `curve.ts setup`. */
  readonly lookupTable?: string | null;
};

export const DEPLOYED = data as Deployed;

/** Every config, flat: the list a page or the saving service walks to find launches on chain. */
export function configsOf(d: Deployed = DEPLOYED): Array<{ address: string; stock: CurveStock; kind: CurveKind }> {
  const out: Array<{ address: string; stock: CurveStock; kind: CurveKind }> = [];
  for (const [stock, kinds] of Object.entries(d.configs) as Array<[CurveStock, Partial<Record<CurveKind, ConfigRecord>>]>) {
    for (const [kind, rec] of Object.entries(kinds ?? {}) as Array<[CurveKind, ConfigRecord | undefined]>) {
      if (rec) out.push({ address: rec.address, stock, kind });
    }
  }
  return out;
}
