/**
 * THE NAMES A PERSON SAYS, for the eleven assets the chain can price. Small and dependency-free,
 * so a client component can say "S&P 500" without shipping the whole catalogue. The plan's own
 * words: S&P 500, Nasdaq 100, Nvidia, Microsoft, Alphabet, Tesla, Meta, Apple, Amazon, Strategy,
 * and gold.
 */
export const AUTO_NAMES: Readonly<Record<string, string>> = {
  SPYx: "S&P 500",
  QQQx: "Nasdaq 100",
  NVDAx: "Nvidia",
  MSFTx: "Microsoft",
  GOOGLx: "Alphabet",
  TSLAx: "Tesla",
  METAx: "Meta",
  AAPLx: "Apple",
  AMZNx: "Amazon",
  MSTRx: "Strategy",
  GOLD: "Gold",
};

/** "S&P 500" for SPYx; the symbol itself for anything not on the list. */
export function nameOf(symbol: string | null | undefined): string {
  if (!symbol) return "stock";
  return AUTO_NAMES[symbol] ?? symbol;
}
