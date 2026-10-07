import data from "@/lib/assets/catalogue.json";
import { type Asset, assetByMint, offeredAssets } from "@/lib/assets/registry";
import { AUTO_NAMES } from "./names";

/**
 * WHAT A SAVE CAN BUY — the catalogue, read by `scripts/stock-catalogue.ts` and checked in.
 *
 * Two lists, kept apart on purpose:
 *
 *   the catalogue   every stock from xStocks, Ondo and Backpack that Jupiter routes at $5 and
 *                   $100 without moving the price, whose transfers are not restricted. A save
 *                   now can buy any of them, at a weekend too: it is a swap, not a sweep.
 *   the registry    the eleven assets the chain can price (`registry.ts`). Only these can be
 *                   saved automatically, because a sweep settles against a Pyth price the
 *                   program verifies. They carry the "Saves automatically" mark.
 *
 * A stock is named the way a person says it, with the ticker and the issuer in small type.
 * The disclosure is per issuer and per mint, never a banner: it is written from each
 * issuer's own documents and from the powers read off that mint.
 */

export type IssuerKey = "xstocks" | "ondo" | "backpack" | "oro";

export type Issuer = {
  readonly key: IssuerKey;
  /** As written on a row: "xStocks", "Ondo", "Backpack", "Oro". */
  readonly short: string;
  readonly name: string;
  /** What the token is, from the issuer's own documents. */
  readonly what: string;
  /** Who may not hold it. */
  readonly who: string;
  readonly url: string;
};

export const ISSUERS: Readonly<Record<IssuerKey, Issuer>> = {
  xstocks: {
    key: "xstocks",
    short: "xStocks",
    name: "Backed Finance (xStocks)",
    what: "A tracker certificate issued by Backed, not a share: no voting rights, and dividends are reinvested rather than paid.",
    who: "Not offered to US persons.",
    url: "https://xstocks.fi",
  },
  ondo: {
    key: "ondo",
    short: "Ondo",
    name: "Ondo Global Markets",
    what: "A structured note issued by Ondo Global Markets (BVI) Limited that tracks the stock, dividends reinvested net of withholding tax: not a share, and no voting rights.",
    who: "Not offered to US persons, and not available in several other countries under Ondo's eligibility terms.",
    url: "https://docs.ondo.finance/ondo-stocks/legal-and-regulatory",
  },
  backpack: {
    key: "backpack",
    short: "Backpack",
    name: "Backpack Securities",
    what: "A tokenized security from Backpack Securities, created with Sunrise: each token is backed 1:1 by a real share held in custody and can be redeemed for it through Backpack.",
    who: "Backpack Securities is not available in the United States, the United Kingdom, the UAE or Japan.",
    url: "https://learn.backpack.exchange/articles/what-is-backpack-securities",
  },
  oro: {
    key: "oro",
    short: "Oro",
    name: "Oro",
    what: "Allocated gold: one troy ounce per token, vaulted and audited, redeemable on Oro's own terms.",
    who: "Subject to Oro's terms.",
    url: "https://oro.xyz",
  },
};

export type Powers = {
  readonly permanentDelegate: boolean;
  readonly pausable: boolean;
  readonly freezeAuthority: boolean;
  readonly hasMultiplier: boolean;
};

export type SaveStock = {
  readonly mint: string;
  /** The token's own symbol: NVDAx, NVDAon, MU. */
  readonly symbol: string;
  /** The exchange ticker it follows: NVDA. */
  readonly ticker: string;
  /** As a person says it: "Nvidia", "S&P 500". */
  readonly name: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly program: "spl-token" | "token-2022";
  readonly powers: Powers;
  /** On the registry and priced on chain: a rule can save into it automatically. */
  readonly auto: boolean;
  readonly icon: string;
  readonly liquidityUsd: number;
};

type Row = (typeof data.stocks)[number];

/** The six a person sees before they search, in this order. S&P 500 is selected. */
export const FEATURED_SYMBOLS = ["SPYx", "NVDAx", "AAPLx", "MSFTx", "TSLAx", "QQQx"] as const;
export const DEFAULT_STOCK_SYMBOL = "SPYx";

/** A route that moves the price more than this at $100 is too thin to offer a saver. */
const MAX_IMPACT_AT_100 = 2;

function fromRow(r: Row): SaveStock {
  const issuer = ISSUERS[r.issuer as IssuerKey];
  const auto = offeredAssets().some((a) => a.mint === r.mint);
  return {
    mint: r.mint,
    symbol: r.symbol,
    ticker: r.ticker,
    name: AUTO_NAMES[r.symbol] && auto ? AUTO_NAMES[r.symbol]! : r.name,
    issuer,
    decimals: r.decimals,
    program: r.program as SaveStock["program"],
    powers: {
      permanentDelegate: r.powers.permanentDelegate,
      pausable: r.powers.pausable,
      freezeAuthority: r.powers.freezeAuthority,
      hasMultiplier: r.powers.hasMultiplier,
    },
    auto,
    icon: r.icon,
    liquidityUsd: r.liquidityUsd,
  };
}

/** A registry asset the catalogue does not carry (gold is not tagged a stock), drawn from the registry row. */
function fromAsset(a: Asset): SaveStock {
  return {
    mint: a.mint,
    symbol: a.symbol,
    ticker: a.symbol,
    name: AUTO_NAMES[a.symbol] ?? a.name,
    issuer: a.kind === "metal" ? ISSUERS.oro : ISSUERS.xstocks,
    decimals: a.decimals,
    program: a.program,
    powers: {
      permanentDelegate: a.powers.permanentDelegate,
      pausable: a.powers.pausable,
      freezeAuthority: a.powers.freezeAuthority,
      hasMultiplier: a.powers.hasMultiplier,
    },
    auto: true,
    icon: "",
    liquidityUsd: a.depth?.liquidityUsd ?? 0,
  };
}

let built: { all: readonly SaveStock[]; byMint: ReadonlyMap<string, SaveStock> } | null = null;

function build() {
  if (built) return built;
  const rows = data.stocks.filter((r) => r.route100 !== null && r.route100.impactPct <= MAX_IMPACT_AT_100);
  const stocks = rows.map(fromRow);
  const have = new Set(stocks.map((s) => s.mint));
  for (const a of offeredAssets()) if (!have.has(a.mint)) stocks.push(fromAsset(a));
  // The eleven first, in the registry's order; then the rest by depth.
  const order = new Map(offeredAssets().map((a, i) => [a.mint, i] as const));
  stocks.sort((x, y) => (order.get(x.mint) ?? 99) - (order.get(y.mint) ?? 99) || y.liquidityUsd - x.liquidityUsd);
  built = { all: stocks, byMint: new Map(stocks.map((s) => [s.mint, s] as const)) };
  return built;
}

export function catalogue(): readonly SaveStock[] {
  return build().all;
}

export function stockByMint(mint: string): SaveStock | undefined {
  return build().byMint.get(mint);
}

export function featured(): readonly SaveStock[] {
  const all = catalogue();
  return FEATURED_SYMBOLS.map((s) => all.find((x) => x.symbol === s)).filter((x): x is SaveStock => !!x);
}

export function defaultStock(): SaveStock {
  const s = catalogue().find((x) => x.symbol === DEFAULT_STOCK_SYMBOL);
  if (!s) throw new Error(`the default stock ${DEFAULT_STOCK_SYMBOL} is not in the catalogue`);
  return s;
}

/** When the catalogue was read, for the line under the search. */
export const CATALOGUE_READ_AT: string = data.readAt;

/** The registry row for a catalogue stock that the chain can price, for the Pyth fill. */
export function pricedAsset(stock: SaveStock): Asset | undefined {
  return stock.auto ? assetByMint(stock.mint) : undefined;
}

/**
 * What the issuer can do to this token, from the powers read off its mint. A permanent
 * delegate can move or burn it from any account; a pause stops every transfer; a freeze
 * authority can freeze one account. Said in one sentence, or that it can do none of them.
 */
export function powersSentence(p: Powers): string {
  const can: string[] = [];
  if (p.permanentDelegate) can.push("move or burn");
  if (p.freezeAuthority) can.push("freeze");
  if (p.pausable) can.push("pause");
  if (can.length === 0) return "The mint gives the issuer no power to move or freeze it once it is in your wallet.";
  const list = can.length === 1 ? can[0]! : `${can.slice(0, -1).join(", ")} or ${can[can.length - 1]!}`;
  return `The issuer can ${list} this token, so self-custody here means not Scrip's custody.`;
}

/** The whole disclosure for one stock: what it is, what the issuer can do, who may not hold it. */
export function disclosure(stock: SaveStock): string {
  const registered = stock.auto ? assetByMint(stock.mint) : undefined;
  if (registered) return registered.disclosure;
  return `${stock.issuer.what} ${powersSentence(stock.powers)} ${stock.issuer.who}`;
}

/** What the client needs to draw the picker and search: small, and nothing it cannot show. */
export type PickerStock = {
  readonly mint: string;
  readonly name: string;
  readonly ticker: string;
  readonly symbol: string;
  readonly issuer: string;
  readonly auto: boolean;
  readonly decimals: number;
};

export function toPicker(s: SaveStock): PickerStock {
  return { mint: s.mint, name: s.name, ticker: s.ticker, symbol: s.symbol, issuer: s.issuer.short, auto: s.auto, decimals: s.decimals };
}
