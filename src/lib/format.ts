/**
 * Shared display formatters. Pure and framework-agnostic, so a server component and a
 * client leaf render the SAME string from the same number — no per-component definitions
 * that can drift.
 *
 * Every locale is pinned to "en-US" on purpose. `toLocaleString(undefined, …)` renders
 * "$1,000" on a US server and "$1.000" in a European browser, which is a React hydration
 * mismatch on every SSR-ed amount. Same input, same string, always.
 */

const group = (v: number, min: number, max: number): string =>
  v.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/**
 * USD in prose. Whole amounts read clean ($500); fractional amounts always show full
 * cents ($459.40, never a dangling $459.4). Rounds to cents first to shed floating-point
 * dust before deciding whether the value is whole.
 */
export const usd = (n: number): string => {
  const v = Math.round(n * 100) / 100;
  return `$${group(v, Number.isInteger(v) ? 0 : 2, 2)}`;
};

/**
 * The same amount with the cents ALWAYS shown, for stacked or aligned columns. "$0" sitting
 * beside "$0.50" in tabular figures reads as a rendering fault rather than a round number.
 */
export const usdAligned = (n: number): string => `$${group(Math.round(n * 100) / 100, 2, 2)}`;

/**
 * QUANTITY PRECISION IS A MONEY DECISION, not a style one. Each unit is rendered to a
 * precision whose last digit is worth well under a cent at today's prices, so a rounded
 * display can never hide value:
 *
 *   1 fine gram of gold  ≈ $110  → 4dp resolves ~$0.011
 *   1 troy ounce silver  ≈  $40  → 4dp resolves ~$0.004
 *   1 SPY share          ≈ $650  → 6dp resolves ~$0.0007
 *
 * Trailing zeros are kept. These numbers live in columns under tabular figures, and a
 * ragged decimal column is how a reader misreads a balance.
 */
export const GRAM_DP = 4;
export const OZ_DP = 4;
export const SHARE_DP = 6;

/** Fine grams of gold: "12.4081 g". */
export const grams = (n: number): string => `${group(n, GRAM_DP, GRAM_DP)} g`;

/** Troy ounces of silver: "3.2500 oz". */
export const troyOz = (n: number): string => `${group(n, OZ_DP, OZ_DP)} oz`;

/** Share-equivalents, unitless — the caller names the ticker beside it. */
export const shares = (n: number): string => group(n, SHARE_DP, SHARE_DP);

/** Basis points as a percentage: 5000 → "50%", 2550 → "25.5%". */
export const bps = (n: number): string => {
  const pct = n / 100;
  return `${group(pct, 0, 2)}%`;
};

/**
 * Token base units → a display number. `decimals` is the MINT's decimals, never a guess:
 * USDC is 6, most xStocks are 8, and reading one as the other is a 100x error in a balance.
 */
export const fromBase = (base: bigint | number, decimals: number): number =>
  Number(base) / 10 ** decimals;

/** Shorten a base58 address or a signature for display: "7xKXtg…9Fma". */
export const short = (a: string): string =>
  a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

/** Capitalize the first letter. */
export const cap = (s: string): string => (s ? `${s[0]!.toUpperCase()}${s.slice(1)}` : s);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * A deterministic short date ("Jul 1", or "Jul 1, 2026") — fixed month names and UTC, so a
 * US-locale server and a client in any locale render the same string. Use this for any
 * SSR-ed date instead of `toLocaleDateString`.
 */
export const shortDateUTC = (unixSeconds: number, withYear = false): string => {
  const d = new Date(unixSeconds * 1000);
  const base = `${MONTHS[d.getUTCMonth()]!} ${d.getUTCDate()}`;
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base;
};

/** A full UTC stamp for receipts: "12 Sep 2026, 14:03 UTC". Receipts get the whole truth. */
export const stampUTC = (unixSeconds: number): string => {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
};

/**
 * Compact relative time ("just now", "12m ago", "3h ago", "2d ago", else a short date).
 * `now` is injectable so tests are deterministic. The absolute fallback uses
 * {@link shortDateUTC} for the same hydration reason.
 */
export const since = (unixSeconds: number, now: number = Date.now()): string => {
  const secs = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDateUTC(unixSeconds);
};
