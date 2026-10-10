import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { DynamicBondingCurveClient, deriveDammV2PoolAddress, deriveMintMetadata } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { type Connection, PublicKey } from "@solana/web3.js";
import { type Outcome, held, ok } from "@/lib/outcome";
import { configsOf } from "./deployed";
import { type CurveKind, type CurveStock, DAMM_V2_CUSTOMIZABLE_CONFIG, THRESHOLD, curveQuote } from "./preset";

/**
 * EVERY LAUNCH ON SCRIP CURVE, READ FROM THE CHAIN. Anyone can launch on a Scrip Curve config, from
 * scrip.work or with Meteora's own SDK, so the list is never a file: it is every DBC pool whose
 * config is one of ours (`getPoolsByConfig`), with its name and symbol read from the token's own
 * Metaplex metadata. The saving service walks it to move fees into the Plans; the pages draw it.
 */
export type ChainLaunch = {
  readonly pool: string;
  readonly baseMint: string;
  readonly creator: string;
  readonly config: string;
  readonly stock: CurveStock;
  readonly kind: CurveKind;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly uri: string | null;
  /** The stock the curve holds, base units. */
  readonly quoteReserveRaw: bigint;
  /** Where it graduates, base units of the stock. */
  readonly thresholdRaw: bigint;
  /** Unix seconds: the fee schedule counts from here. */
  readonly activationUnix: number;
  readonly migrated: boolean;
  /** The partner fee waiting on the curve, base units of the stock: the savers' share. */
  readonly partnerFeeRaw: bigint;
  /** DBC's `migration_fee_withdraw_status`. */
  readonly migrationFeeWithdrawStatus: number;
  /** The graduated DAMM v2 pool, once migrated. */
  readonly dammPool: string | null;
};

/** Metaplex metadata: key, update authority, mint, then three borsh strings padded with zeros. */
export function decodeMetadata(data: Uint8Array): { name: string; symbol: string; uri: string } | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let at = 1 + 32 + 32;
    const str = () => {
      const len = view.getUint32(at, true);
      if (len > 1024) throw new Error("not metadata");
      at += 4;
      const s = new TextDecoder().decode(data.subarray(at, at + len)).replace(/\0+$/g, "").trim();
      at += len;
      return s;
    };
    return { name: str(), symbol: str(), uri: str() };
  } catch {
    return null;
  }
}

export function curveClient(conn: Connection): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(conn, "confirmed");
}

/** Every launch on every Scrip Curve config, newest first. */
export async function launchesOnChain(conn: Connection, configs = configsOf()): Promise<Outcome<ChainLaunch[]>> {
  if (configs.length === 0) return ok([]);
  const dbc = curveClient(conn);
  const found: Array<Omit<ChainLaunch, "name" | "symbol" | "uri">> = [];
  try {
    for (const c of configs) {
      const quote = curveQuote(c.stock);
      const thresholdRaw = BigInt(Math.round(THRESHOLD[c.kind][c.stock] * 10 ** quote.decimals));
      for (const p of await dbc.state.getPoolsByConfig(c.address)) {
        const s = p.account.poolState;
        const migrated = Boolean(s.isMigrated);
        found.push({
          pool: p.publicKey.toBase58(),
          baseMint: s.baseMint.toBase58(),
          creator: s.creator.toBase58(),
          config: c.address,
          stock: c.stock,
          kind: c.kind,
          quoteReserveRaw: BigInt(s.quoteReserve.toString()),
          thresholdRaw,
          activationUnix: Number(s.activationPoint.toString()),
          migrated,
          partnerFeeRaw: BigInt(s.partnerQuoteFee.toString()),
          migrationFeeWithdrawStatus: Number(s.migrationFeeWithdrawStatus),
          dammPool: migrated ? deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_CONFIG, s.baseMint, new PublicKey(quote.mint)).toBase58() : null,
        });
      }
    }
  } catch (err) {
    return held(`the launches could not be read (${err instanceof Error ? err.message : String(err)})`);
  }
  const metas = new Map<string, { name: string; symbol: string; uri: string } | null>();
  const mints = found.map((f) => f.baseMint);
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const infos = await conn.getMultipleAccountsInfo(batch.map((m) => deriveMintMetadata(new PublicKey(m))), "confirmed").catch(() => batch.map(() => null));
    batch.forEach((m, j) => metas.set(m, infos[j] ? decodeMetadata(infos[j]!.data) : null));
  }
  const out = found.map((f) => {
    const m = metas.get(f.baseMint) ?? null;
    return { ...f, name: m?.name ?? null, symbol: m?.symbol ?? null, uri: m?.uri ?? null };
  });
  return ok(out.sort((a, b) => b.activationUnix - a.activationUnix));
}

/** One launch, by its pool address: null when it is not on a Scrip Curve config. */
export async function launchAt(conn: Connection, pool: string, configs = configsOf()): Promise<Outcome<ChainLaunch | null>> {
  let address: PublicKey;
  try {
    address = new PublicKey(pool);
  } catch {
    return ok(null);
  }
  let state;
  try {
    state = (await curveClient(conn).state.getPool(address))?.poolState;
  } catch (err) {
    return held(`the curve could not be read (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!state) return ok(null);
  const c = configs.find((x) => x.address === state.config.toBase58());
  if (!c) return ok(null);
  const quote = curveQuote(c.stock);
  const meta = await conn.getAccountInfo(deriveMintMetadata(state.baseMint), "confirmed").catch(() => null);
  const m = meta ? decodeMetadata(meta.data) : null;
  const migrated = Boolean(state.isMigrated);
  return ok({
    pool: address.toBase58(),
    baseMint: state.baseMint.toBase58(),
    creator: state.creator.toBase58(),
    config: c.address,
    stock: c.stock,
    kind: c.kind,
    name: m?.name ?? null,
    symbol: m?.symbol ?? null,
    uri: m?.uri ?? null,
    quoteReserveRaw: BigInt(state.quoteReserve.toString()),
    thresholdRaw: BigInt(Math.round(THRESHOLD[c.kind][c.stock] * 10 ** quote.decimals)),
    activationUnix: Number(state.activationPoint.toString()),
    migrated,
    partnerFeeRaw: BigInt(state.partnerQuoteFee.toString()),
    migrationFeeWithdrawStatus: Number(state.migrationFeeWithdrawStatus),
    dammPool: migrated ? deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_CONFIG, state.baseMint, new PublicKey(quote.mint)).toBase58() : null,
  });
}

/** The fee claimer's locked position in a graduated pool: DBC hands it the partner's share. */
export async function partnerPositionOf(conn: Connection, dammPool: string, claimer: string): Promise<{ position: string; nftAccount: string } | null> {
  try {
    const positions = await new CpAmm(conn).getUserPositionByPool(new PublicKey(dammPool), new PublicKey(claimer));
    const p = positions[0];
    return p ? { position: p.position.toBase58(), nftAccount: p.positionNftAccount.toBase58() } : null;
  } catch {
    return null;
  }
}
