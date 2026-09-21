import { ImageResponse } from "next/og";
import { PublicKey } from "@solana/web3.js";
import { readBookOf, resolveHandle } from "@/lib/book/read-book";
import { bps, short } from "@/lib/format";
import { validateSlug } from "@/lib/handle";
import { connection } from "@/lib/solana/connection";

export const runtime = "nodejs";
export const alt = "Pay in stock on Scrip";
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

/**
 * THE CARD A PAY LINK CARRIES. What the payer needs before they click: who is being paid,
 * that it lands as stock in their own wallet, and what their rule does with it. Read from
 * the chain; where there is no register, the card says the payer would be giving a first
 * share rather than pretending there is a rule.
 */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const slug = validateSlug(handle);
  const owner = slug.ok ? await resolveHandle(slug.value) : null;
  const who = slug.ok ? `@${slug.value}` : short(handle);
  const address = owner && owner.ok ? owner.value : null;
  const book = address ? await readBookOf(connection(), new PublicKey(address)).catch(() => null) : null;
  const rule = book && book.ok && book.value?.rule.enabled ? book.value.rule : null;

  return new ImageResponse(
    (
      <div style={{ ...flexCol, width: "100%", height: "100%", background: paper, padding: 56, fontFamily: "monospace", color: ink, justifyContent: "space-between" }}>
        <div style={{ ...flexRow, justifyContent: "space-between", alignItems: "center", fontSize: 24, color: faint }}>
          <div style={{ ...flexRow, alignItems: "center", gap: 12, color: ink }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, background: ok }} />
            <div style={{ display: "flex" }}>Pay {who}</div>
          </div>
          <div style={{ display: "flex" }}>Scrip</div>
        </div>
        <div style={{ ...flexCol, gap: 12 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, fontFamily: "sans-serif" }}>
            {rule ? `Pay ${who} in stock.` : `Pay ${who}.`}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: muted, lineHeight: 1.4 }}>
            {rule
              ? `It lands in their own wallet with a receipt anyone can open. Or send USDC to their normal address: their rule turns ${bps(rule.rateBps)} of it into stock by itself.`
              : "It lands in their own wallet as a first share they claim, with a receipt anyone can open. No account, no brokerage, either side."}
          </div>
        </div>
        <div style={{ ...flexRow, gap: 48, borderTop: `2px solid ${line}`, paddingTop: 28, fontSize: 24, color: muted }}>
          <div style={{ display: "flex" }}>A reason on the receipt</div>
          <div style={{ display: "flex", color: accent }}>Settled against Pyth</div>
          <div style={{ display: "flex" }}>Not our custody</div>
        </div>
      </div>
    ),
    size,
  );
}
