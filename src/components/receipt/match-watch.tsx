"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * WHILE A MATCH MAY STILL LAND — a sponsor's Plan matches an automatic save in its own
 * transaction, seconds after the save. Rendered only on a fresh receipt whose owner is in a
 * Plan and has no match yet: the page reads the chain again every few seconds until `until`
 * (unix seconds), so the match appears in place instead of on the next visit.
 */
export function MatchWatch({ until }: { until: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() / 1000 > until) clearInterval(id);
      else router.refresh();
    }, 6_000);
    return () => clearInterval(id);
  }, [router, until]);
  return (
    <p className="sp-receipt-watch" role="status">
      This wallet is in a sponsor&rsquo;s Plan: its match follows the save within seconds, and appears on this receipt when it lands.
    </p>
  );
}
