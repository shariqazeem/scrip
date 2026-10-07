"use client";

import { useEffect, useState } from "react";
import { currencyFor } from "@/lib/fx/zones";

/**
 * DOLLARS, AND THE SAME IN THE VIEWER'S OWN MONEY.
 *
 * People think in the money they spend, so every dollar amount a saver reads can carry its
 * local twin: "$5 · Rs 1,385". The currency comes from the viewer's clock (`zones.ts`), the
 * rate from `/api/fx`, which names its source and date. Until both are known, and for a viewer
 * whose money is the dollar, it returns nothing, and the dollar stands alone.
 */
export type LocalMoney = {
  readonly currency: string;
  readonly perUsd: number;
  readonly updated: number;
  readonly source: string;
  readonly sourceUrl: string;
  /** Dollars → "Rs 1,385", rounded to the unit people count in. */
  readonly format: (usd: number) => string;
};

let shared: Promise<LocalMoney | null> | null = null;

function load(): Promise<LocalMoney | null> {
  if (shared) return shared;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currency = currencyFor(zone, navigator.languages ?? [navigator.language]);
  if (!currency || currency === "USD") return (shared = Promise.resolve(null));
  shared = fetch(`/api/fx?currency=${currency}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ currency: string; perUsd: number; updated: number; source: string; sourceUrl: string }>) : null))
    .then((j) => {
      if (!j) return null;
      let fmt: Intl.NumberFormat;
      try {
        fmt = new Intl.NumberFormat(navigator.language, { style: "currency", currency: j.currency, maximumFractionDigits: j.perUsd >= 20 ? 0 : 2 });
      } catch {
        return null;
      }
      return { ...j, format: (usd: number) => fmt.format(usd * j.perUsd) };
    })
    .catch(() => null);
  return shared;
}

export function useLocalMoney(): LocalMoney | null {
  const [money, setMoney] = useState<LocalMoney | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((m) => {
      if (live) setMoney(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return money;
}
