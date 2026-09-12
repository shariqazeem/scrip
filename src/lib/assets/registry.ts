/**
 * WHAT A BOOK MAY HOLD — the one registry, and every field in it was read off mainnet rather
 * than copied from a docs page.
 *
 * Verified 2026-09-12 against the mint accounts themselves (`getAccountInfo` + Token-2022
 * extension unpack) and against Jupiter's token API for depth and holder counts. A mint
 * address typed from memory is not a typo, it is a transfer to a stranger, so nothing is in
 * this file that was not read from the chain.
 *
 * THE DISCLOSURE IS PER-ROW, NOT A BANNER. A blanket "the issuer can move, burn or freeze"
 * would be false about the gold sleeve and is the kind of lazy honesty that reads as
 * dishonesty once someone checks: Oro GOLD is a plain SPL mint with NO freeze authority, no
 * permanent delegate and no transfer hook, while SPYx carries all three. Each row says what
 * is true of that mint.
 *
 * GOLD IS METAL OR IT IS NOT GOLD. `unit: "gram"` is reserved for a token that is a claim on
 * allocated bullion. A fund share that tracks bullion — GLDx at ~$398, which is the price of
 * a GLD ETF share and not of an ounce — is `kind: "fund"`, is listed under funds, and may
 * never be displayed in grams. The same test killed silver-as-ounces: see SILVER_FINDING.
 */

/** How a holding is counted on screen. The unit is a claim about what the token IS. */
export type Unit = "gram" | "troy-ounce" | "share" | "fund-share" | "dollar";

export type AssetKind = "metal" | "equity" | "fund" | "cash";

export type Issuer = {
  /** The name that appears on the row. Every asset names one. */
  readonly name: string;
  /** The legal wrapper, in the words a reader can check. */
  readonly wrapper: string;
  readonly url: string;
};

export type Asset = {
  readonly symbol: string;
  readonly name: string;
  /** base58 mint address, read from mainnet. */
  readonly mint: string;
  /** The mint's OWN decimals. Never defaulted — reading 8 as 6 is a 100x error. */
  readonly decimals: number;
  readonly program: "spl-token" | "token-2022";
  readonly kind: AssetKind;
  readonly unit: Unit;
  /**
   * How many `unit`s one whole token is. Oro GOLD is one troy ounce, which is 31.1034768
   * fine grams, so the home screen can say grams without the token pretending to be one.
   */
  readonly unitsPerToken: string;
  readonly issuer: Issuer;
  /** true when the mint carries a Token-2022 ScaledUiAmount multiplier we must track. */
  readonly hasMultiplier: boolean;
  /** true when the issuer holds a PermanentDelegate: it can move or burn the token. */
  readonly permanentDelegate: boolean;
  /** true when a freeze authority or a pause authority exists: it can be frozen. */
  readonly freezable: boolean;
  /** Present and non-null when the mint reserves a transfer hook, even a disabled one. */
  readonly transferHook: "none" | "reserved-disabled" | "active";
  /** A transfer fee changes what actually arrives. Named so allocation can account for it. */
  readonly transferFee: boolean;
  /** One sentence, shown on the asset row. Says the thing a judge would otherwise find. */
  readonly disclosure: string;
};

/** One troy ounce in fine grams. The definition, not an approximation. */
export const GRAMS_PER_TROY_OUNCE = "31.1034768";

const BACKED: Issuer = {
  name: "Backed Finance (xStocks)",
  wrapper: "Swiss DLT tracker certificate, 1:1 collateralised, no shareholder rights",
  url: "https://xstocks.fi",
};

const ORO: Issuer = {
  name: "Oro",
  wrapper: "Allocated bullion, one troy ounce per token, vaulted with Brinks and audited monthly",
  url: "https://oro.xyz",
};

const ONDO: Issuer = {
  name: "Ondo Global Markets",
  wrapper: "Tokenised ETF share, 1:1 backed, dividends reinvested",
  url: "https://ondo.finance",
};

const CIRCLE: Issuer = {
  name: "Circle",
  wrapper: "Fiat-backed stablecoin",
  url: "https://circle.com",
};

/**
 * THE DEFAULT MIX, and the evidence that set it.
 *
 * The product law was 50% gold / 20% silver / 30% the market, with an explicit instruction to
 * VERIFY the silver leg before shipping it. Verified on 2026-09-12, it failed: see
 * SILVER_FINDING. Silver left the default and the metal weight absorbed it, holding the
 * 70:30 metal-to-market ratio the original mix expressed.
 */
export const DEFAULT_POLICY_BPS: ReadonlyArray<{ symbol: string; bps: number }> = [
  { symbol: "GOLD", bps: 7000 },
  { symbol: "SPYx", bps: 3000 },
];

/**
 * WHY SILVER IS NOT A SLEEVE — kept in the code, beside the registry, because a finding that
 * lives only in a commit message is a finding the next session re-litigates.
 *
 * Checked on Solana mainnet, 2026-09-12, via Jupiter's token API and the mint accounts:
 *
 *   SLVon  iShares Silver Trust (Ondo)   ~$48k liquidity    a FUND share, ~$59 ≈ the SLV ETF
 *   SLVx   iShares Silver Trust (xStocks)  ~$1 liquidity    a FUND share, 310 holders
 *   XAGx   "Silver XStock"                 ~$1 liquidity    3 holders; not a real listing
 *   AGon   First Majestic Silver (Ondo)     $0 liquidity    a MINER's equity, not metal
 *
 * There is no allocated-silver token on Solana with real depth. Every instrument is a fund
 * tracker or a mining company. The rule that stops GLDx being called a gram stops SLVon being
 * called an ounce, so silver moved under funds and out of the default mix. It stays holdable
 * by anyone who wants it — clearly labelled as a fund share, never in ounces.
 */
export const SILVER_FINDING =
  "No allocated-silver token on Solana has meaningful liquidity — every listing is a fund " +
  "tracker or a miner's equity. Silver is holdable as a fund share and is not a default sleeve.";

/**
 * Every asset, in the order a book displays them: metal first, the market next, funds after,
 * dollars last.
 */
export const ASSETS: readonly Asset[] = [
  {
    symbol: "GOLD",
    name: "Oro Gold",
    mint: "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A",
    decimals: 6,
    program: "spl-token",
    kind: "metal",
    unit: "troy-ounce",
    unitsPerToken: "1",
    issuer: ORO,
    hasMultiplier: false,
    // Read off the mint on 2026-09-12: a plain SPL mint, freezeAuthority null, no extensions
    // at all. The cleanest asset in the registry, and the reason the disclosure below is
    // narrower than the one on the equity sleeve.
    permanentDelegate: false,
    freezable: false,
    transferHook: "none",
    transferFee: false,
    disclosure:
      "Allocated metal: one troy ounce per token. The mint has no freeze authority and no " +
      "permanent delegate, so once it is in your wallet nobody can move or freeze it. " +
      "Redemption and vaulting follow Oro's own terms.",
  },
  {
    symbol: "SPYx",
    name: "SP500 xStock",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    decimals: 8,
    program: "token-2022",
    kind: "equity",
    unit: "share",
    unitsPerToken: "1",
    issuer: BACKED,
    hasMultiplier: true,
    permanentDelegate: true,
    freezable: true,
    transferHook: "reserved-disabled",
    transferFee: false,
    disclosure:
      "A tracker certificate, not a share: no voting rights, and dividends are reinvested " +
      "through a mint-level multiplier rather than paid. The issuer holds a permanent " +
      "delegate and a pause authority, so it can move, burn or freeze this token. " +
      "Self-custody here means not our custody.",
  },
  {
    symbol: "GLDx",
    name: "Gold xStock",
    mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
    decimals: 8,
    program: "token-2022",
    // A claim on SPDR Gold Shares, priced around $398 — an ETF share, not an ounce of metal
    // at ~$4,365. This row exists to be labelled correctly, not to be shown under grams.
    kind: "fund",
    unit: "fund-share",
    unitsPerToken: "1",
    issuer: BACKED,
    hasMultiplier: true,
    permanentDelegate: true,
    freezable: true,
    transferHook: "reserved-disabled",
    transferFee: false,
    disclosure:
      "A fund share that tracks gold, not gold. One token is one share of SPDR Gold Shares, " +
      "not one ounce of metal, and Webgold will never display it in grams. Issuer permanent " +
      "delegate and pause authority apply.",
  },
  {
    symbol: "SLVon",
    name: "iShares Silver Trust",
    mint: "iy11ytbSGcUnrjE6Lfv78TFqxKyUESfku1FugS9ondo",
    decimals: 9,
    program: "token-2022",
    kind: "fund",
    unit: "fund-share",
    unitsPerToken: "1",
    issuer: ONDO,
    hasMultiplier: true,
    // Read on 2026-09-12: no PermanentDelegate extension, but a freeze authority and a
    // pause authority both exist.
    permanentDelegate: false,
    freezable: true,
    transferHook: "reserved-disabled",
    transferFee: false,
    disclosure:
      "A fund share that tracks silver, not silver. This is why silver is not a default " +
      "sleeve: no allocated-silver token on Solana has real depth, so there are no honest " +
      "ounces to show. A pause authority applies.",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    program: "spl-token",
    kind: "cash",
    unit: "dollar",
    unitsPerToken: "1",
    issuer: CIRCLE,
    hasMultiplier: false,
    permanentDelegate: false,
    freezable: true,
    transferHook: "none",
    transferFee: false,
    disclosure:
      "Dollars waiting to be allocated. Circle holds a freeze authority over this mint.",
  },
];

const BY_MINT = new Map(ASSETS.map((a) => [a.mint, a]));
const BY_SYMBOL = new Map(ASSETS.map((a) => [a.symbol, a]));

export function assetByMint(mint: string): Asset | undefined {
  return BY_MINT.get(mint);
}

export function assetBySymbol(symbol: string): Asset | undefined {
  return BY_SYMBOL.get(symbol);
}

/** The mints the multiplier watcher must poll — exactly those that carry one. */
export function multiplierMints(): readonly Asset[] {
  return ASSETS.filter((a) => a.hasMultiplier);
}

/** Every mint a payout may settle into. Cash is a holding, not a sleeve. */
export function eligibleMints(): readonly string[] {
  return ASSETS.map((a) => a.mint);
}
