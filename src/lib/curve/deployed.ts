import data from "./deployed.json";

/**
 * WHAT SCRIP CURVE HAS ON CHAIN — every address the CLI created, written back by
 * `scripts/curve.ts` and checked in. Public keys and signatures only: nothing secret ever goes
 * in this file. The page, the keeper and the CLI all read the same list, so they cannot drift.
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
  /** The partner's DAMM v2 position and its NFT account, owned by the vault after graduation. */
  readonly partnerPosition?: string;
  readonly partnerPositionNftAccount?: string;
};

export type Deployed = {
  readonly cluster: string;
  readonly vault: null | {
    readonly address: string;
    readonly base: string;
    readonly mint: string;
    readonly savingsPool: string;
    readonly scrip: string;
    readonly createdSig: string;
  };
  readonly configs: Partial<Record<"public" | "demonstration", { readonly address: string; readonly createdSig: string }>>;
  readonly launches: readonly Launch[];
};

export const DEPLOYED = data as Deployed;
