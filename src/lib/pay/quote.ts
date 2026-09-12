import type { Allocation, AllocationLeg } from "@/lib/allocator";
import { assetByMint } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * A QUOTE — an allocation, flattened so it can cross the wire.
 *
 * The allocation itself is computed on the SERVER, because it needs the recipient's signed
 * policy, live Pyth prices and the asset registry, and because the rule that weights come
 * from the recipient is not a rule if the browser can choose them. What crosses back is
 * arithmetic the browser can check and a set of amounts it can turn into a transaction.
 *
 * Every amount is a DECIMAL STRING, not a number. A u64 of token base units does not survive
 * JSON's float, and a balance that loses its last digits on the way to a wallet is a balance
 * that settles wrong.
 */
export type QuoteLeg = {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  /** Token base units, as a decimal string. */
  readonly amount: string;
  /** USD value at the stamp, 6-decimal base units, as a decimal string. */
  readonly valueBase: string;
  readonly bps: number;
  /** The price used and when it was published, so the payer can see what they are settling at. */
  readonly priceBase: string;
  readonly publishedAt: number;
  readonly source: string;
};

export type QuoteView = {
  readonly recipient: string;
  readonly requestedBase: string;
  readonly valueBase: string;
  readonly gramsE8: string;
  readonly legs: readonly QuoteLeg[];
  /**
   * Where the split came from. "named" means no policy was consulted at all, because nothing
   * was left for one to decide — saying "default" there would claim a decision nobody made.
   */
  readonly policySource: "signed" | "default" | "named";
  /**
   * The recipient's active goal, when one is taking a share of what arrives. The payer sees
   * it before they sign: a payout that is 25% diverted is a different payout, and hiding that
   * would make the receipt read as a surprise.
   */
  readonly goal: { readonly address: string; readonly name: string; readonly skimBps: number } | null;
};

export function toQuoteView(
  recipient: string,
  allocation: Allocation,
  policySource: QuoteView["policySource"],
  goal: QuoteView["goal"] = null,
): QuoteView {
  return {
    recipient,
    goal,
    requestedBase: allocation.requestedBase.toString(),
    valueBase: allocation.valueBase.toString(),
    gramsE8: allocation.gramsE8.toString(),
    policySource,
    legs: allocation.legs.map((l) => ({
      mint: l.asset.mint,
      symbol: l.asset.symbol,
      name: l.asset.name,
      amount: l.amount.toString(),
      valueBase: l.valueBase.toString(),
      bps: l.bps,
      priceBase: l.price.base.toString(),
      publishedAt: l.price.publishedAt,
      source: l.asset.price.label,
    })),
  };
}

/**
 * Rebuild an allocation from a quote, for the browser to encode into instructions.
 *
 * It re-resolves every mint through the registry rather than trusting the symbol and decimals
 * that came over the wire. A quote is data from a network, and the only fields taken on trust
 * here are the amounts — which the payer sees, approves in their own wallet, and which the
 * program checks against the accounts supplied.
 */
export function fromQuoteView(view: QuoteView): Outcome<Allocation> {
  const legs: AllocationLeg[] = [];
  for (const leg of view.legs) {
    const asset = assetByMint(leg.mint);
    if (!asset) return held(`This quote names an asset Webgold does not know: ${leg.mint}`);
    let amount: bigint;
    let valueBase: bigint;
    let priceBase: bigint;
    try {
      amount = BigInt(leg.amount);
      valueBase = BigInt(leg.valueBase);
      priceBase = BigInt(leg.priceBase);
    } catch {
      return held("This quote carries an amount that is not a whole number.");
    }
    if (amount <= 0n) return held(`${asset.symbol}: this quote carries an empty leg.`);
    legs.push({
      asset,
      amount,
      valueBase,
      bps: leg.bps,
      price: { feedId: "", base: priceBase, confBase: 0n, publishedAt: leg.publishedAt },
    });
  }
  if (legs.length === 0) return held("This quote has nothing in it.");
  try {
    return ok({
      legs,
      valueBase: BigInt(view.valueBase),
      requestedBase: BigInt(view.requestedBase),
      gramsE8: BigInt(view.gramsE8),
    });
  } catch {
    return held("This quote carries a total that is not a whole number.");
  }
}
