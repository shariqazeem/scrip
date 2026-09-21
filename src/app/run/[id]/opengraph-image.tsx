import { ImageResponse } from "next/og";
import { short, usdc } from "@/lib/format";
import { runView } from "@/lib/org/view";

export const runtime = "nodejs";
export const alt = "A Scrip payroll run";
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

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = /^[0-9a-f]{32}$/.test(id) ? await runView(id) : null;
  const head = run ? `${run.settled} people paid in stock.` : "No run at this id.";
  return new ImageResponse(
    (
      <div style={{ ...flexCol, width: "100%", height: "100%", background: paper, padding: 56, fontFamily: "monospace", color: ink, justifyContent: "space-between" }}>
        <div style={{ ...flexRow, justifyContent: "space-between", fontSize: 24, color: faint }}>
          <div style={{ ...flexRow, alignItems: "center", gap: 12, color: ink }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, background: ok }} />
            <div style={{ display: "flex" }}>{run ? `A run by ${run.payerHandle ? `@${run.payerHandle}` : short(run.payer)}` : "Scrip"}</div>
          </div>
          <div style={{ display: "flex" }}>Scrip</div>
        </div>
        <div style={{ ...flexCol, gap: 10 }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, fontFamily: "sans-serif" }}>{run?.label || head}</div>
          <div style={{ display: "flex", fontSize: 24, color: muted }}>{run ? `${head} Each line is a receipt anyone can open, with its reason.` : ""}</div>
        </div>
        {run ? (
          <div style={{ ...flexRow, gap: 48, borderTop: `2px solid ${line}`, paddingTop: 28 }}>
            <div style={{ ...flexCol, gap: 6 }}>
              <div style={{ display: "flex", fontSize: 20, color: faint }}>Paid</div>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{run.settled} of {run.planned}</div>
            </div>
            <div style={{ ...flexCol, gap: 6 }}>
              <div style={{ display: "flex", fontSize: 20, color: faint }}>In all</div>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1, color: accent }}>{usdc(BigInt(run.paidUsdc))}</div>
            </div>
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
