/**
 * WHAT A RULE MAY BUY — the one registry, and every field in it was read off mainnet.
 *
 * Read 2026-09-12 (SPYx, GOLD, USDC) and 2026-09-15 (the rest) from the mint accounts
 * themselves — decimals, token program, freeze authority, and each Token-2022 extension —
 * and from Jupiter's token API for depth and holders. Pyth feed ids from Hermes on
 * 2026-09-15. A mint address typed from memory is not a typo, it is a transfer to a
 * stranger, so nothing is in this file that was not read from an account or an API.
 *
 * The program compiles the same mints and feeds into `anchor/programs/scrip/src/registry.rs`.
 * `spec-agreement.test.ts` reads that file and this one and fails if they disagree.
 *
 * THE DISCLOSURE IS PER ROW, NEVER A BANNER. Every xStock carries a permanent delegate and a
 * pause authority; Oro GOLD carries neither. A blanket warning would be false about the gold
 * row, and a false warning is the kind of lazy honesty that reads as dishonesty the moment
 * somebody checks.
 *
 * TWO FEEDS PER ASSET, and the difference is the whole corporate-action problem:
 *
 *   raw       prices one RAW token as it trades (Pyth `Crypto.SPYX/USD`). Already carries
 *             the issuer's multiplier; published around the clock.
 *   adjusted  prices one UI unit — one share (Pyth `Equity.US.SPY/USD`). The token account
 *             counts raw units, so a min-out through this feed divides by the live
 *             multiplier. Published in market hours.
 */

export type Unit = "share" | "troy-ounce" | "dollar";
export type AssetKind = "index" | "equity" | "metal" | "cash";

export type Issuer = {
  readonly name: string;
  /** The legal wrapper, in words a reader can check. */
  readonly wrapper: string;
  readonly url: string;
};

export type PriceFeed = {
  /** Pyth's feed id, hex, no 0x. The stable identifier; the program stores it on the Book. */
  readonly feedId: string;
  /**
   * A pinned on-chain PriceUpdateV2 account for this feed, when one is known to be pushed
   * continuously. Empty means none is pinned: the keeper posts its own update from Hermes.
   */
  readonly account: string;
  readonly label: string;
  /**
   * How old a price may be and still be shown as a display price. The program's settle bound
   * is a constant, FEED_MAX_AGE (600 s); this one is only about painting a number.
   */
  readonly maxDisplayAgeSeconds: number;
};

/** What a mint's Token-2022 extensions say the issuer can do. Read off the mint. */
export type IssuerPowers = {
  readonly permanentDelegate: boolean;
  readonly pausable: boolean;
  readonly freezeAuthority: boolean;
  readonly transferHook: "none" | "reserved-disabled" | "active";
  readonly transferFee: boolean;
  readonly hasMultiplier: boolean;
};

export type Asset = {
  readonly symbol: string;
  readonly name: string;
  /** base58 mint, read from mainnet. */
  readonly mint: string;
  /** The mint's OWN decimals. Reading 8 as 6 is a 100x error. */
  readonly decimals: number;
  readonly program: "spl-token" | "token-2022";
  readonly kind: AssetKind;
  readonly unit: Unit;
  readonly issuer: Issuer;
  readonly powers: IssuerPowers;
  /** One or two sentences, shown on the row. Says what a judge would otherwise find. */
  readonly disclosure: string;
  readonly feedRaw: PriceFeed | null;
  readonly feedAdjusted: PriceFeed | null;
  /** True when a rule may buy it. USDC is the pay-in asset, never a rule asset. */
  readonly ruleEligible: boolean;
  /** The underlying the tracker follows, for copy. */
  readonly underlying: string;
  /** Jupiter's figures on the read date, for the assets page. USD. */
  readonly depth: { readonly liquidityUsd: number; readonly volume24hUsd: number; readonly holders: number; readonly readAt: string } | null;
  /** True for a single company's stock: allowed as a choice, never a default. */
  readonly singleName: boolean;
};

const BACKED: Issuer = {
  name: "Backed Finance (xStocks)",
  wrapper: "Swiss DLT tracker certificate, 1:1 collateralised, no shareholder rights, dividends reinvested",
  url: "https://xstocks.fi",
};

const ORO: Issuer = {
  name: "Oro",
  wrapper: "Allocated bullion, one troy ounce per token, vaulted with Brinks and audited monthly",
  url: "https://oro.xyz",
};

const CIRCLE: Issuer = {
  name: "Circle",
  wrapper: "Fiat-backed stablecoin",
  url: "https://circle.com",
};

/** Every xStock read on 2026-09-15 carried exactly this set. */
const XSTOCK_POWERS: IssuerPowers = {
  permanentDelegate: true,
  pausable: true,
  freezeAuthority: true,
  transferHook: "reserved-disabled",
  transferFee: false,
  hasMultiplier: true,
};

const XSTOCK_DISCLOSURE =
  "A tracker certificate issued by Backed, not a share: no voting rights, and dividends are " +
  "reinvested through a mint-level multiplier rather than paid. The issuer holds a permanent " +
  "delegate and a pause authority, so it can move, burn or freeze this token. Self-custody " +
  "here means not our custody. Not offered to US persons; the owner attests eligibility.";

const READ_AT = "2026-09-15";

/** The default asset for a new rule. */
export const DEFAULT_ASSET_SYMBOL = "SPYx";
/** The pay-in asset. The rule watches the owner's USDC associated token account. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

function xstock(a: {
  symbol: string;
  name: string;
  mint: string;
  underlying: string;
  feedRawId: string;
  feedAdjustedId: string;
  rawAccount?: string;
  adjustedAccount?: string;
  liquidityUsd: number;
  volume24hUsd: number;
  holders: number;
  kind: "index" | "equity";
}): Asset {
  const t = a.underlying.replace(/^Equity\.US\./, "");
  return {
    symbol: a.symbol,
    name: a.name,
    mint: a.mint,
    decimals: 8,
    program: "token-2022",
    kind: a.kind,
    unit: "share",
    issuer: BACKED,
    powers: XSTOCK_POWERS,
    disclosure: XSTOCK_DISCLOSURE,
    feedRaw: {
      feedId: a.feedRawId,
      account: a.rawAccount ?? "",
      label: `Pyth Crypto.${a.symbol.toUpperCase()}/USD`,
      maxDisplayAgeSeconds: 50 * 3600,
    },
    feedAdjusted: {
      feedId: a.feedAdjustedId,
      account: a.adjustedAccount ?? "",
      label: `Pyth Equity.US.${t}/USD`,
      maxDisplayAgeSeconds: 50 * 3600,
    },
    ruleEligible: true,
    underlying: a.underlying,
    depth: { liquidityUsd: a.liquidityUsd, volume24hUsd: a.volume24hUsd, holders: a.holders, readAt: READ_AT },
    singleName: a.kind === "equity",
  };
}

/**
 * Every asset, in the order the product lists them: the pay-in dollar first, the two index
 * trackers, the metal, then the single names by depth on the read date.
 */
export const ASSETS: readonly Asset[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    mint: USDC_MINT,
    decimals: USDC_DECIMALS,
    program: "spl-token",
    kind: "cash",
    unit: "dollar",
    issuer: CIRCLE,
    powers: {
      permanentDelegate: false,
      pausable: false,
      freezeAuthority: true,
      transferHook: "none",
      transferFee: false,
      hasMultiplier: false,
    },
    disclosure: "The dollars the rule watches. Circle holds a freeze authority over this mint.",
    feedRaw: {
      feedId: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
      account: "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
      label: "Pyth Crypto.USDC/USD",
      maxDisplayAgeSeconds: 3600,
    },
    feedAdjusted: null,
    ruleEligible: false,
    underlying: "USD",
    depth: null,
    singleName: false,
  },
  xstock({
    symbol: "SPYx",
    name: "SP500 xStock",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    underlying: "SPY",
    kind: "index",
    feedRawId: "2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14",
    feedAdjustedId: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
    // Sponsored accounts found by scanning the receiver program (write authority = self).
    // The SPYX one measured 65 hours stale on 2026-09-15, which is why the keeper posts.
    rawAccount: "jf8MarLKgBte4f3NWufbNpGRCuBfJLhuZPuFigvSQR2",
    adjustedAccount: "CRDaGwcVnKdRNRtx6fjHtvrBgKM5U55AhbqBWhtPMDA",
    liquidityUsd: 3_694_117,
    volume24hUsd: 27_428_640,
    holders: 70_085,
  }),
  xstock({
    symbol: "QQQx",
    name: "Nasdaq xStock",
    mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    underlying: "QQQ",
    kind: "index",
    feedRawId: "178a6f73a5aede9d0d682e86b0047c9f333ed0efe5c6537ca937565219c4054d",
    feedAdjustedId: "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d",
    liquidityUsd: 1_683_353,
    volume24hUsd: 3_350_780,
    holders: 38_351,
  }),
  {
    symbol: "GOLD",
    name: "Oro Gold",
    mint: "GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A",
    decimals: 6,
    program: "spl-token",
    kind: "metal",
    unit: "troy-ounce",
    issuer: ORO,
    // Read off the mint: a plain SPL mint, freezeAuthority null, no extensions at all.
    powers: {
      permanentDelegate: false,
      pausable: false,
      freezeAuthority: false,
      transferHook: "none",
      transferFee: false,
      hasMultiplier: false,
    },
    disclosure:
      "Allocated metal: one troy ounce per token. The mint has no freeze authority and no " +
      "permanent delegate, so once it is in your wallet nobody can move or freeze it. " +
      "Redemption and vaulting follow Oro's own terms. Priced by the metal feed, which is " +
      "published in market hours.",
    feedRaw: {
      feedId: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
      account: "2UK6JWZKvqFwU7mAt76TePbtNn99MPzKMqZNq4DEPbCa",
      label: "Pyth Metal.XAU/USD",
      maxDisplayAgeSeconds: 50 * 3600,
    },
    feedAdjusted: null,
    ruleEligible: true,
    underlying: "XAU",
    depth: { liquidityUsd: 381_086, volume24hUsd: 275_284, holders: 10_888, readAt: READ_AT },
    singleName: false,
  },
  xstock({ symbol: "CRCLx", name: "Circle xStock", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", underlying: "CRCL", kind: "equity", feedRawId: "c13184461c0c80d98ffcd89be627c2220b94a96c7c67f0c4b16bc12fd3b17758", feedAdjustedId: "92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365", liquidityUsd: 2_287_325, volume24hUsd: 11_240_474, holders: 17_888 }),
  xstock({ symbol: "NVDAx", name: "NVIDIA xStock", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", underlying: "NVDA", kind: "equity", feedRawId: "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f", feedAdjustedId: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593", liquidityUsd: 1_720_476, volume24hUsd: 7_227_402, holders: 92_835 }),
  xstock({ symbol: "MSFTx", name: "Microsoft xStock", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", underlying: "MSFT", kind: "equity", feedRawId: "bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5", feedAdjustedId: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1", liquidityUsd: 546_166, volume24hUsd: 5_342_990, holders: 23_263 }),
  xstock({ symbol: "GOOGLx", name: "Alphabet xStock", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", underlying: "GOOGL", kind: "equity", feedRawId: "b911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e", feedAdjustedId: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6", liquidityUsd: 439_774, volume24hUsd: 3_108_429, holders: 27_224 }),
  xstock({ symbol: "TSLAx", name: "Tesla xStock", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", underlying: "TSLA", kind: "equity", feedRawId: "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362", feedAdjustedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", liquidityUsd: 1_201_927, volume24hUsd: 2_538_373, holders: 39_342 }),
  xstock({ symbol: "METAx", name: "Meta xStock", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", underlying: "META", kind: "equity", feedRawId: "bf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900", feedAdjustedId: "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe", liquidityUsd: 250_116, volume24hUsd: 2_442_076, holders: 11_505 }),
  xstock({ symbol: "AAPLx", name: "Apple xStock", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", underlying: "AAPL", kind: "equity", feedRawId: "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675", feedAdjustedId: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", liquidityUsd: 716_894, volume24hUsd: 2_415_935, holders: 33_315 }),
  xstock({ symbol: "AMZNx", name: "Amazon xStock", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", underlying: "AMZN", kind: "equity", feedRawId: "7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8", feedAdjustedId: "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a", liquidityUsd: 239_578, volume24hUsd: 1_843_559, holders: 14_958 }),
  xstock({ symbol: "MSTRx", name: "MicroStrategy xStock", mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", underlying: "MSTR", kind: "equity", feedRawId: "53f95ba4e23ed15ea56083e2ee9a5eec48055d6f59033d4bb95f1ca2a2349c28", feedAdjustedId: "e1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09", liquidityUsd: 788_456, volume24hUsd: 1_806_333, holders: 13_304 }),
  xstock({ symbol: "COINx", name: "Coinbase xStock", mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", underlying: "COIN", kind: "equity", feedRawId: "641435d5dffb5311140b480517c79986d8488d5cf08a11eec53b83ad02cab33f", feedAdjustedId: "fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245", liquidityUsd: 582_730, volume24hUsd: 1_730_224, holders: 8_220 }),
  xstock({ symbol: "HOODx", name: "Robinhood xStock", mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", underlying: "HOOD", kind: "equity", feedRawId: "dd49a9ac6df5cbfa9d8fc6371f7ae927a74d5c6763c1c01b4220d70314c647f9", feedAdjustedId: "306736a4035846ba15a3496eed57225b64cc19230a50d14f3ed20fd7219b7849", liquidityUsd: 504_056, volume24hUsd: 1_407_471, holders: 12_893 }),
];

const BY_MINT = new Map(ASSETS.map((a) => [a.mint, a]));
const BY_SYMBOL = new Map(ASSETS.map((a) => [a.symbol, a]));

export function assetByMint(mint: string): Asset | undefined {
  return BY_MINT.get(mint);
}

export function assetBySymbol(symbol: string): Asset | undefined {
  return BY_SYMBOL.get(symbol);
}

/** What a rule may buy, in listing order. */
export function ruleAssets(): readonly Asset[] {
  return ASSETS.filter((a) => a.ruleEligible);
}

export function defaultAsset(): Asset {
  const a = assetBySymbol(DEFAULT_ASSET_SYMBOL);
  if (!a) throw new Error(`the default asset ${DEFAULT_ASSET_SYMBOL} is not registered`);
  return a;
}

/** The mints whose multiplier the watcher records — exactly those that carry one. */
export function multiplierMints(): readonly Asset[] {
  return ASSETS.filter((a) => a.powers.hasMultiplier);
}

/** The asset a feed id belongs to, and whether that feed prices a raw token or a UI unit. */
export function assetByFeedId(feedId: string): { asset: Asset; basis: "raw" | "adjusted" } | undefined {
  for (const a of ASSETS) {
    if (a.feedRaw?.feedId === feedId) return { asset: a, basis: "raw" };
    if (a.feedAdjusted?.feedId === feedId) return { asset: a, basis: "adjusted" };
  }
  return undefined;
}

/** Pyth's receiver program. The same id on mainnet and devnet. */
export const PYTH_RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";

/**
 * THE DEVNET STAND-INS. The devnet build of the program prices any mint by these two feeds,
 * which ARE pushed on devnet at the same addresses as mainnet. `SOL` stands in as the raw
 * feed; `USDC` as the adjusted one, so a test mint with a scaled-UI multiplier exercises the
 * conversion SPYx needs on mainnet.
 */
export const DEVNET_FEEDS = {
  raw: {
    feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    account: "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
    label: "Pyth Crypto.SOL/USD",
    maxDisplayAgeSeconds: 3600,
  },
  adjusted: {
    feedId: "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    account: "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
    label: "Pyth Crypto.USDC/USD",
    maxDisplayAgeSeconds: 3600,
  },
} as const satisfies Record<string, PriceFeed>;

/**
 * A DEVNET STAND-IN. A book opened against a mint the registry does not know, on a cluster
 * that is not mainnet, is a test asset: the e2e battery and the demo script mint one. It is
 * labelled as exactly that, never as a stock, and its decimals and program are read from the
 * mint itself. On mainnet this is never built: a mint off the registry stays "held".
 */
export function standInAsset(mint: string, decimals: number, program: "spl-token" | "token-2022", hasMultiplier: boolean): Asset {
  return {
    symbol: "stand-in",
    name: "a devnet stand-in, priced by Pyth SOL/USD",
    mint,
    decimals,
    program,
    kind: "index",
    unit: "share",
    issuer: { name: "the demo script", wrapper: "a test mint on devnet, worth nothing", url: "" },
    powers: { permanentDelegate: false, pausable: false, freezeAuthority: false, transferHook: "none", transferFee: false, hasMultiplier },
    disclosure: "A test mint on devnet. It stands in for SPYx so the rule, the sweep and the receipt can be shown; the price it is checked against is Pyth SOL/USD.",
    feedRaw: null,
    feedAdjusted: null,
    ruleEligible: true,
    underlying: "nothing",
    depth: null,
    singleName: false,
  };
}
