/**
 * WHAT A LAUNCH MAY BE CALLED — plain, short, and never Scrip or a stock. Small and
 * dependency-free, so the launch form checks a name as it is typed with the same rule the server
 * builds by.
 */
export function launchNameProblem(name: string, symbol: string): string | null {
  const n = name.trim();
  const s = symbol.trim();
  if (n.length < 2 || n.length > 32) return "A name is 2 to 32 characters.";
  if (s.length < 2 || s.length > 10) return "A symbol is 2 to 10 characters.";
  if (!/^[A-Za-z0-9 .'-]+$/.test(n)) return "A name uses letters, numbers, spaces and . ' - only.";
  if (!/^[A-Za-z0-9]+$/.test(s)) return "A symbol uses letters and numbers only.";
  if (/scrip/i.test(n) || /scrip/i.test(s)) return "A launch is never called a Scrip token: choose a name without “Scrip”.";
  // Nothing that reads as the stock it is priced in, or any stock: a launch is not a share.
  const stockWords = /\b(nasdaq|s&?p ?500|sp500|tesla|nvidia|apple|microsoft|alphabet|google|amazon|meta|xstocks?|stocks?|shares?|equity|etf)\b/i;
  const tickers = /^(QQQ|SPY|TSLA|NVDA|AAPL|MSFT|GOOGL?|AMZN|META|MSTR|COIN|HOOD|CRCL)X?$/i;
  if (stockWords.test(n) || tickers.test(s)) return "A launch cannot be named like a stock: it is a token priced in one, not a share of it.";
  return null;
}
