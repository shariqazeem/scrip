import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * WHAT THE KEEPER REPORTS, read by the app for "last sweep 3 min ago" and for the states a
 * rule card must render. Served by the keeper process on `KEEPER_HEALTH_PORT`.
 */
export type KeeperBookReport = {
  readonly owner: string;
  readonly lastSeenAt: number;
  readonly lastSweepAt: number | null;
  readonly lastSweepSig: string | null;
  /** Why the last look did not sweep, in a sentence. null when it did. */
  readonly lastReason: string | null;
  readonly failures: number;
};

export type KeeperHealth = {
  readonly at: number;
  readonly keeper: string;
  readonly cluster: string;
  readonly hermes: "keyed" | "keyless";
  readonly books: Record<string, KeeperBookReport>;
  readonly sweeps: number;
  /** Vests this keeper has submitted since it started, and grants it is watching. */
  readonly vests?: number;
  readonly grantsWatched?: number;
  readonly startedAt: number;
};

/**
 * EVERY KEEPER THIS DEPLOYMENT RUNS. `KEEPER_HEALTH_URL` takes a comma-separated list,
 * because running two is the point of a permissionless keeper: they hold different keys,
 * race for every sweep, and the loser's transaction simply fails. One url still works.
 */
export function keeperHealthUrls(): readonly string[] {
  return (process.env.KEEPER_HEALTH_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Each keeper's report, in the order configured: the first is the one the app quotes. */
export async function keeperHealths(): Promise<ReadonlyArray<Outcome<KeeperHealth>>> {
  return Promise.all(keeperHealthUrls().map((u) => healthAt(u)));
}

export async function keeperHealth(): Promise<Outcome<KeeperHealth>> {
  const url = keeperHealthUrls()[0];
  if (!url) return held("No keeper is configured (KEEPER_HEALTH_URL).");
  return healthAt(url);
}

async function healthAt(url: string): Promise<Outcome<KeeperHealth>> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2_500) });
    if (!res.ok) return held(`The keeper answered ${res.status}.`);
    const j = (await res.json()) as KeeperHealth;
    if (typeof j.at !== "number") return held("The keeper's report could not be read.");
    if (Date.now() / 1000 - j.at > 120) return held(`The keeper last reported ${Math.floor(Date.now() / 1000 - j.at)} seconds ago.`);
    return ok(j);
  } catch (err) {
    return held(`The keeper could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  }
}
