/** The wire shapes of the save endpoints, shared by the widget, the sheet and the server page. */

export type QuoteBody = {
  readonly quote: {
    readonly mint: string;
    readonly inUsdc: string;
    readonly outRaw: string;
    readonly minOutRaw: string;
    readonly impactPct: number;
    readonly slippageBps: number;
    readonly route: readonly string[];
    readonly perUnitUsd: number;
  };
  readonly cost: { readonly feeLamports: number; readonly depositLamports: number };
  readonly solUsd: number | null;
};

export type WalletBody = {
  readonly usdc: string;
  readonly lamports: number;
  readonly inflows: ReadonlyArray<{ sig: string; at: number; usdc: string; from: string | null }>;
  readonly suggestion: { sig: string; at: number; usdc: string; saveUsdc: string; rateBps: number } | null;
};

export type BuiltBody = QuoteBody & { readonly transactionBase64: string; readonly lastValidBlockHeight: number };

/** Dollars as a person writes them: "$5", "$13.74", "$1,250". */
export function dollars(usd: number): string {
  const whole = Math.abs(usd - Math.round(usd)) < 0.005;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** Token units, short: four places from a hundredth up, three significant figures below it. */
export function unitsText(raw: string | bigint, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 0.01) return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

/** A month and day in the reader's own calendar: "6 Oct". */
export function dayMonth(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Lamports in cents at a SOL price, said kindly: "less than 1 cent", "about 46 cents", "about $1.20". */
export function solInMoney(lamports: number, solUsd: number | null): string | null {
  if (!solUsd) return null;
  const usd = (lamports / 1e9) * solUsd;
  if (usd < 0.01) return "less than 1 cent";
  if (usd < 1) return `about ${Math.round(usd * 100)} cents`;
  return `about $${usd.toFixed(2)}`;
}
