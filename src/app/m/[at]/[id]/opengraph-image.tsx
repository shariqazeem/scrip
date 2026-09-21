import { ImageResponse } from "next/og";
import { arrivalUnits } from "@/components/stub/from-row";
import { dateUTC, usdc } from "@/lib/format";
import { loadMoment } from "./load";

export const runtime = "nodejs";
export const alt = "A moment on Scrip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const paper = "#f7f5ef";
const white = "#ffffff";
const ink = "#14161c";
const muted = "#5a5d66";
const faint = "#8b8e97";
const line = "#e4dfd3";
const ok = "#15803d";
const flexRow = { display: "flex" as const, flexDirection: "row" as const };
const flexCol = { display: "flex" as const, flexDirection: "column" as const };

/** THE SHARE CARD: the stub that crossed it, with the milestone line above. No confetti. */
export default async function Image({ params }: { params: Promise<{ at: string; id: string }> }) {
  const { at, id } = await params;
  const found = await loadMoment(at, id);
  const a = found?.arrival ?? null;
  const units = a ? arrivalUnits(a) : null;
  return new ImageResponse(
    (
      <div style={{ ...flexRow, width: "100%", height: "100%", background: paper, padding: 56, fontFamily: "monospace", color: ink, gap: 48, alignItems: "center" }}>
        <div style={{ ...flexCol, flex: 1, gap: 18 }}>
          <div style={{ ...flexRow, alignItems: "center", gap: 12, fontSize: 24, color: faint }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, background: ok }} />
            <div style={{ display: "flex" }}>{found ? `@${found.slug}` : "Scrip"}</div>
            <div style={{ display: "flex" }}>·</div>
            <div style={{ display: "flex" }}>{found ? dateUTC(found.milestone.atUnix) : ""}</div>
          </div>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 700, letterSpacing: -2, lineHeight: 1.03, fontFamily: "sans-serif" }}>{found ? found.milestone.line : "No moment at this address."}</div>
          <div style={{ display: "flex", fontSize: 24, color: muted, lineHeight: 1.4 }}>{found ? found.milestone.sub : ""}</div>
          <div style={{ display: "flex", fontSize: 22, color: faint, marginTop: 8 }}>Scrip · a rule on the wallet you get paid to</div>
        </div>
        {a && units ? (
          <div style={{ ...flexCol, width: 420, background: white, border: `2px solid ${line}`, borderRadius: 12, padding: 32, gap: 14 }}>
            <div style={{ ...flexRow, justifyContent: "space-between", fontSize: 20, color: faint }}>
              <div style={{ display: "flex" }}>A receipt, on chain</div>
              <div style={{ display: "flex" }}>Scrip</div>
            </div>
            {a.kind === "sweep" ? <div style={{ display: "flex", fontSize: 26 }}>{usdc(BigInt(a.basisUsdc))} landed</div> : null}
            <div style={{ display: "flex", fontSize: 20, color: muted }}>{a.kind === "sweep" ? `${a.rateBps / 100}% becomes` : "became"}</div>
            <div style={{ ...flexRow, alignItems: "flex-end", gap: 10 }}>
              <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -3 }}>{units.units}</div>
              <div style={{ display: "flex", fontSize: 28, color: muted, paddingBottom: 10 }}>{units.symbol}</div>
            </div>
            <div style={{ display: "flex", height: 2, background: line }} />
            <div style={{ ...flexRow, justifyContent: "space-between", fontSize: 20, color: muted }}>
              <div style={{ display: "flex" }}>{dateUTC(a.settledUnix)}</div>
              <div style={{ display: "flex" }}>{usdc(BigInt(a.paidUsdc))}</div>
            </div>
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
