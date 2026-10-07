"use client";

import { useLocalMoney } from "./use-local-money";

/**
 * THE SAME AMOUNT IN THE READER'S OWN MONEY, after a dollar figure: " · PKR 1,385". Nothing on
 * the server or for a dollar reader, so the dollar line is complete without it, and the title
 * names the rate and its source for anyone who wants to check it.
 */
export function LocalAmount({ usd }: { usd: number }) {
  const money = useLocalMoney();
  if (!money) return null;
  const day = money.updated ? new Date(money.updated * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "today";
  return (
    <span className="sp-local" title={`At ${money.perUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${money.currency} to the dollar, ${money.source}, ${day}`}>
      {" "}
      · {money.format(usd)}
    </span>
  );
}
