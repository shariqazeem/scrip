import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * HERMES — Pyth's off-chain price service, where the keeper gets a fresh update to post
 * when the on-chain account is older than the program's bound.
 *
 * Since 2026-08-26 Hermes requires an API key (`Authorization: Bearer`). Without one the
 * keeper can only use an on-chain account somebody else keeps fresh — and the SPYX/USD
 * sponsored account measured 65 hours stale on 2026-09-15. So on mainnet the key is not
 * optional, and the keeper says so at startup rather than failing on the first sweep.
 */

export function hermesUrl(): string {
  return (process.env.PYTH_HERMES_URL?.trim() || "https://pyth.dourolabs.app/hermes").replace(/\/+$/, "");
}

export function hermesKey(): string | null {
  return process.env.PYTH_API_KEY?.trim() || null;
}

export type HermesLatest = {
  readonly feedId: string;
  readonly price: bigint;
  readonly conf: bigint;
  readonly expo: number;
  readonly publishTime: number;
  /** The signed update, base64, ready for the receiver's `post_update`. */
  readonly binaryBase64: string;
};

export async function latest(feedIds: readonly string[]): Promise<Outcome<HermesLatest[]>> {
  if (feedIds.length === 0) return ok([]);
  const key = hermesKey();
  const q = feedIds.map((id) => `ids[]=${id}`).join("&");
  let res: Response;
  try {
    res = await fetch(`${hermesUrl()}/v2/updates/price/latest?${q}&encoding=base64&parsed=true`, {
      headers: { accept: "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      cache: "no-store",
    });
  } catch (err) {
    return held(`Hermes could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (res.status === 401 || res.status === 403) {
    return held(
      key
        ? "Hermes refused the API key (PYTH_API_KEY)."
        : "Hermes requires an API key since 2026-08-26. Set PYTH_API_KEY; without it no fresh price can be posted.",
    );
  }
  if (!res.ok) return held(`Hermes refused (${res.status}).`);
  const j = (await res.json()) as {
    binary?: { encoding: string; data: string[] };
    parsed?: Array<{ id: string; price: { price: string; conf: string; expo: number; publish_time: number } }>;
  };
  const binary = j.binary?.data?.[0];
  if (!binary || !j.parsed?.length) return held("Hermes returned no update.");
  return ok(
    j.parsed.map((p) => ({
      feedId: p.id,
      price: BigInt(p.price.price),
      conf: BigInt(p.price.conf),
      expo: p.price.expo,
      publishTime: p.price.publish_time,
      binaryBase64: binary,
    })),
  );
}
