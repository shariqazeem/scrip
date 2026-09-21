import { ImageResponse } from "next/og";
import { readReceiptBySignature } from "@/lib/book/read-receipt";
import { bps, short, stampUTC, unitsFromRaw, usdc } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "A Scrip receipt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * THE SHARE IMAGE — the stub, rendered for a link preview. Read from the chain like the
 * page; when the signature carries no receipt the image says so rather than inventing one.
 *
 * Satori renders it, and Satori requires every container with more than one child to
 * declare `display: flex` — every div below does.
 */
const paper = "#f7f5ef";
const ink = "#14161c";
const muted = "#5a5d66";
const faint = "#8b8e97";
const line = "#e4dfd3";
const ok = "#15803d";

const flexRow = { display: "flex" as const, flexDirection: "row" as const };
const flexCol = { display: "flex" as const, flexDirection: "column" as const };

export default async function Image({ params }: { params: Promise<{ sig: string }> }) {
  const { sig } = await params;
  const r = await readReceiptBySignature(sig);

  if (!r.ok) {
    return new ImageResponse(
      (
        <div style={{ ...flexRow, width: "100%", height: "100%", background: paper, alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: muted, fontSize: 36 }}>
          No receipt at this signature
        </div>
      ),
      size,
    );
  }
  const v = r.value;
  const decimals = v.asset_?.decimals ?? 0;
  const symbol = v.asset_?.symbol ?? "units";
  const units = decimals ? unitsFromRaw(v.amountRaw, decimals) : v.amountRaw.toString();
  const landed = v.kind === "sweep" ? `${usdc(v.basisUsdc)} landed` : `${usdc(v.paidUsdc)} paid`;
  const became = v.kind === "sweep" ? `${bps(v.rateBps)} became` : v.kind === "gift" ? "A first position, claimed" : v.kind === "grant" ? "Granted, vesting" : v.kind === "vest" ? "Vested" : "It became";

  return new ImageResponse(
    (
      <div style={{ ...flexRow, width: "100%", height: "100%", background: paper, alignItems: "center", justifyContent: "center", padding: 48 }}>
        <div style={{ ...flexCol, width: 720, background: "#ffffff", border: `2px solid ${line}`, borderRadius: 16, padding: 40, fontFamily: "monospace", color: ink }}>
          <div style={{ ...flexRow, justifyContent: "space-between", fontSize: 20, color: faint, marginBottom: 24 }}>
            <div style={{ ...flexRow, color: ok, alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", width: 10, height: 10, borderRadius: 10, background: ok }} />
              <div style={{ display: "flex" }}>Settled on Solana</div>
            </div>
            <div style={{ display: "flex" }}>Scrip</div>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: muted }}>{landed}</div>
          <div style={{ display: "flex", fontSize: 22, color: faint, marginTop: 18 }}>{became}</div>
          <div style={{ ...flexRow, alignItems: "baseline", fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>
            <div style={{ display: "flex" }}>{units}</div>
            <div style={{ display: "flex", fontSize: 34, color: muted, marginLeft: 14, fontWeight: 500 }}>{symbol}</div>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: faint, marginTop: 20 }}>{stampUTC(v.settledUnix)}</div>
          <div style={{ display: "flex", fontSize: 22, color: muted, marginTop: 6 }}>in {short(v.recipient)}&apos;s wallet</div>
          <div style={{ ...flexRow, borderTop: `2px solid ${line}`, marginTop: 28, paddingTop: 18, justifyContent: "space-between", fontSize: 20, color: muted }}>
            <div style={{ display: "flex" }}>Still held</div>
            <div style={{ display: "flex" }}>measured at 7 and 30 days</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
