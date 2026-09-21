import "server-only";

import { resolveAssets } from "@/lib/assets/stand-in";
import { receiptsFor } from "@/lib/ledger/indexer";

/**
 * MONTHLY STATEMENTS, from receipts: what landed, what became stock, at what prices, what
 * is held. A statement is arithmetic on the past, labelled as such; it projects nothing.
 */
export type StatementLine = {
  readonly id: string;
  readonly sig: string;
  readonly kind: string;
  readonly settledUnix: number;
  readonly basisUsdc: bigint;
  readonly paidUsdc: bigint;
  readonly amountRaw: bigint;
  readonly asset: string;
  readonly symbol: string;
  readonly decimals: number | null;
  readonly reason: string;
  readonly payer: string;
  readonly rateBps: number;
};

export type Statement = {
  /** "2026-09" */
  readonly ym: string;
  readonly label: string;
  readonly fromUnix: number;
  readonly toUnix: number;
  readonly lines: readonly StatementLine[];
  readonly landedUsdc: bigint;
  readonly becameUsdc: bigint;
  readonly unitsByAsset: ReadonlyArray<{ readonly asset: string; readonly symbol: string; readonly decimals: number | null; readonly amountRaw: bigint; readonly paidUsdc: bigint }>;
  readonly sweeps: number;
  readonly payments: number;
  readonly vests: number;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthOf(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

export async function statementsFor(owner: string): Promise<Statement[]> {
  const rows = (await receiptsFor(owner, 2_000)).filter((r) => r.kind !== "grant");
  const labels = await resolveAssets(rows.map((r) => r.asset));
  const byMonth = new Map<string, StatementLine[]>();
  for (const r of rows) {
    const ym = monthOf(r.settledUnix);
    const list = byMonth.get(ym) ?? [];
    list.push({
      id: r.id,
      sig: r.sig,
      kind: r.kind,
      settledUnix: r.settledUnix,
      basisUsdc: BigInt(r.basisUsdc),
      paidUsdc: BigInt(r.paidUsdc),
      amountRaw: BigInt(r.amountRaw),
      asset: r.asset,
      symbol: labels.get(r.asset)?.symbol ?? "units",
      decimals: labels.get(r.asset)?.decimals ?? null,
      reason: r.reason,
      payer: r.payer,
      rateBps: r.rateBps,
    });
    byMonth.set(ym, list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ym, lines]) => {
      const [y, m] = ym.split("-").map(Number);
      const fromUnix = Math.floor(Date.UTC(y!, m! - 1, 1) / 1000);
      const toUnix = Math.floor(Date.UTC(y!, m!, 1) / 1000) - 1;
      const units = new Map<string, { amountRaw: bigint; paidUsdc: bigint }>();
      for (const l of lines) {
        const u = units.get(l.asset) ?? { amountRaw: 0n, paidUsdc: 0n };
        units.set(l.asset, { amountRaw: u.amountRaw + l.amountRaw, paidUsdc: u.paidUsdc + l.paidUsdc });
      }
      return {
        ym,
        label: monthLabel(ym),
        fromUnix,
        toUnix,
        lines: [...lines].sort((a, b) => b.settledUnix - a.settledUnix),
        landedUsdc: lines.filter((l) => l.kind === "sweep").reduce((n, l) => n + l.basisUsdc, 0n),
        becameUsdc: lines.reduce((n, l) => n + l.paidUsdc, 0n),
        unitsByAsset: [...units.entries()].map(([asset, u]) => ({ asset, symbol: labels.get(asset)?.symbol ?? "units", decimals: labels.get(asset)?.decimals ?? null, ...u })),
        sweeps: lines.filter((l) => l.kind === "sweep").length,
        payments: lines.filter((l) => l.kind === "pay" || l.kind === "gift").length,
        vests: lines.filter((l) => l.kind === "vest").length,
      };
    });
}
