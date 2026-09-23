/**
 * WHICH CHAIN THE PRODUCT IS ACTUALLY POINTED AT — one definition, read by the chrome and by
 * every client that opens a connection.
 *
 * It names the SETTLEMENT cluster, never a browser wallet's incidental one: an owner whose
 * wallet happens to sit on devnet must not see a real-money product mislabelled, and an owner
 * on a devnet build must never see it labelled as mainnet. A devnet balance is a real on-chain
 * number with no value, and the chrome says so.
 */
export type Cluster = "mainnet-beta" | "devnet" | "localnet";

const CLUSTERS: Record<Cluster, { label: string; isMainnet: boolean; rpc: string }> = {
  "mainnet-beta": {
    label: "Solana",
    isMainnet: true,
    rpc: "https://api.mainnet-beta.solana.com",
  },
  devnet: { label: "Solana Devnet", isMainnet: false, rpc: "https://api.devnet.solana.com" },
  localnet: { label: "Localnet", isMainnet: false, rpc: "http://127.0.0.1:8899" },
};

function parse(raw: string | undefined): Cluster {
  const v = (raw ?? "").trim();
  return v === "mainnet-beta" || v === "devnet" || v === "localnet" ? v : "devnet";
}

/**
 * Defaults to devnet, not mainnet. An unset env var must fail toward "this is not real
 * money", never toward a claim we cannot back.
 */
/** Scrip's program went live on mainnet on 21 September 2026 (UTC). */
export const MAINNET_SINCE_UNIX = 1_789_948_800;

/** Day 1 is 21 September 2026. Null off mainnet, where the count means nothing. */
export function mainnetDay(nowUnix: number, c: Cluster = cluster()): number | null {
  if (c !== "mainnet-beta" || nowUnix < MAINNET_SINCE_UNIX) return null;
  return Math.floor((nowUnix - MAINNET_SINCE_UNIX) / 86_400) + 1;
}

export function cluster(): Cluster {
  return parse(process.env.NEXT_PUBLIC_SOLANA_CLUSTER);
}

export function clusterConfig(c: Cluster = cluster()) {
  return CLUSTERS[c];
}

/** The RPC endpoint, overridable for a paid provider without changing the cluster's identity. */
export function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || clusterConfig().rpc;
}

/** The explorer link for a signature or an account, on the right cluster. */
export function explorerUrl(
  kind: "tx" | "address",
  value: string,
  c: Cluster = cluster(),
): string {
  const q = c === "mainnet-beta" ? "" : `?cluster=${c === "localnet" ? "custom" : c}`;
  return `https://explorer.solana.com/${kind}/${value}${q}`;
}
