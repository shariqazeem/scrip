import { ImageResponse } from "next/og";
import { PublicKey } from "@solana/web3.js";
import { readGrantAt } from "@/lib/book/read-grant";
import { dateUTC, unitsFromRaw, usdc } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "A Scrip grant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const paper = "#f7f5ef";
const ink = "#14161c";
const muted = "#5a5d66";
const faint = "#8b8e97";
const line = "#e4dfd3";
const accent = "#2b4acb";
const ok = "#15803d";
const flexRow = { display: "flex" as const, flexDirection: "row" as const };
const flexCol = { display: "flex" as const, flexDirection: "column" as const };

export default async function Image({ params }: { params: Promise<{ pda: string }> }) {
  const { pda } = await params;
  let g = null;
  try {
    const r = await readGrantAt(new PublicKey(pda));
    g = r.ok ? r.value : null;
  } catch {
    g = null;
  }
  const units = g && g.asset_ ? `${unitsFromRaw(g.totalRaw, g.asset_.decimals)} ${g.asset_.symbol}` : g ? `${g.totalRaw} units` : "";
  const pct = g && g.totalRaw > 0n ? Number((g.releasedRaw * 10_000n) / g.totalRaw) / 100 : 0;
  return new ImageResponse(
    (
      <div style={{ ...flexCol, width: "100%", height: "100%", background: paper, padding: 56, fontFamily: "monospace", color: ink, justifyContent: "space-between" }}>
        <div style={{ ...flexRow, justifyContent: "space-between", fontSize: 24, color: faint }}>
          <div style={{ ...flexRow, alignItems: "center", gap: 12, color: ink }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, background: ok }} />
            <div style={{ display: "flex" }}>A grant that vests</div>
          </div>
          <div style={{ display: "flex" }}>Scrip</div>
        </div>
        <div style={{ ...flexCol, gap: 10 }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, fontFamily: "sans-serif" }}>
            {g ? `${units}, vesting ${g.durationSecs > 0 ? `over ${Math.round(g.durationSecs / 86_400)} days` : "at the cliff"}.` : "No grant at this address."}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: muted }}>{g ? `Bought for ${usdc(g.declaredUsdc)} on ${dateUTC(g.createdUnix)}. In an escrow the payer cannot spend; while it vests, dividends reinvest into it.` : ""}</div>
        </div>
        {g ? (
          <div style={{ ...flexCol, gap: 18, borderTop: `2px solid ${line}`, paddingTop: 28 }}>
            <div style={{ display: "flex", width: "100%", height: 16, borderRadius: 8, border: `2px solid ${line}`, background: "#fff", overflow: "hidden" }}>
              <div style={{ display: "flex", width: `${pct}%`, height: "100%", background: accent }} />
            </div>
            <div style={{ ...flexRow, justifyContent: "space-between", fontSize: 24, color: muted }}>
              <div style={{ display: "flex" }}>{pct.toFixed(1)}% vested · {g.vests} vest{g.vests === 1 ? "" : "s"}</div>
              <div style={{ display: "flex" }}>{g.state}</div>
            </div>
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
