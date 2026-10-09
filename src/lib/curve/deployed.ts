import data from "./deployed.json";

/**
 * WHAT SCRIP CURVE HAS ON CHAIN — every address the CLI created, written back by
 * `scripts/curve.ts` and checked in. Public keys and signatures only: nothing secret ever goes
 * in this file. The page, the saving service and the CLI all read the same list, so they cannot
 * drift.
 */
export type Launch = {
  readonly name: string;
  readonly symbol: string;
  readonly kind: "public" | "demonstration";
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
  /** The quote of every launch: the Nasdaq 100 (QQQx). */
  readonly quoteMint: string;
  /**
   * Who signs the fee claims: Scrip's saving service. Meteora lets the claimer choose where a fee
   * goes, and this one only ever sends it to the Plan below.
   */
  readonly feeClaimer: string | null;
  /** The Plan every launch fee goes to: Scrip's own, matching savers' automatic saves. */
  readonly plan: null | {
    readonly address: string;
    readonly sponsor: string;
    /** Sixteen bytes, hex: the Plan's seed. */
    readonly planId: string;
    readonly escrow: string;
    readonly createdSig: string;
  };
  readonly configs: Partial<Record<"public" | "demonstration", { readonly address: string; readonly createdSig: string }>>;
  readonly launches: readonly Launch[];
};

export const DEPLOYED = data as Deployed;
