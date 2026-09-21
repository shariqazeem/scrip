import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { liveView } from "@/lib/book/live";
import { readHandle } from "@/lib/book/read-book";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { bps, unitsFromRaw, usdc } from "@/lib/format";
import { validateSlug } from "@/lib/handle";
import { orgView } from "@/lib/org/view";

export const runtime = "nodejs";
export const alt = "A Scrip page";
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

function Card({ eyebrow, headline, sub, facts }: { eyebrow: string; headline: string; sub: string; facts: Array<{ k: string; v: string; color?: string }> }) {
  return (
    <div style={{ ...flexCol, width: "100%", height: "100%", background: paper, padding: 56, fontFamily: "monospace", color: ink, justifyContent: "space-between" }}>
      <div style={{ ...flexRow, justifyContent: "space-between", alignItems: "center", fontSize: 24, color: faint }}>
        <div style={{ ...flexRow, alignItems: "center", gap: 12, color: ink }}>
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 12, background: ok }} />
          <div style={{ display: "flex" }}>{eyebrow}</div>
        </div>
        <div style={{ display: "flex" }}>Scrip</div>
      </div>
      <div style={{ ...flexCol, gap: 10 }}>
        <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, fontFamily: "sans-serif" }}>{headline}</div>
        <div style={{ display: "flex", fontSize: 24, color: muted }}>{sub}</div>
      </div>
      <div style={{ ...flexRow, gap: 48, borderTop: `2px solid ${line}`, paddingTop: 28 }}>
        {facts.map((f) => (
          <div key={f.k} style={{ ...flexCol, gap: 6 }}>
            <div style={{ display: "flex", fontSize: 20, color: faint }}>{f.k}</div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1, color: f.color ?? ink }}>{f.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The share card: a person's proof of saving, or an organisation's "pays in stock since". */
export default async function Image({ params }: { params: Promise<{ at: string }> }) {
  const { at } = await params;
  const raw = decodeURIComponent(at);
  const slug = raw.startsWith("@") ? validateSlug(raw.slice(1)) : null;
  const h = slug && slug.ok ? await readHandle(slug.value) : null;
  const owner = h && h.ok && h.value ? h.value.owner : null;
  const kind = h && h.ok && h.value ? h.value.kind : null;
  const handle = slug && slug.ok ? slug.value : raw;
  if (!owner) return new ImageResponse(<Card eyebrow="Scrip" headline={`Nobody has @${handle} yet.`} sub="A handle is one account on chain." facts={[]} />, size);

  if (kind === "org") {
    const o = await orgView(owner);
    if (!o.ok) return new ImageResponse(<Card eyebrow={`@${handle}`} headline="An organisation on Scrip." sub="" facts={[]} />, size);
    const v = o.value;
    return new ImageResponse(
      <Card
        eyebrow={`@${handle}, an organisation`}
        headline={v.payments > 0 ? "Pays in stock." : "Pays in stock, from the first payment on."}
        sub="Every payment is a receipt anyone can open."
        facts={[
          { k: "People paid", v: String(v.peoplePaid) },
          { k: "Paid", v: usdc(BigInt(v.paidUsdc)) },
          { k: "Grants vesting", v: String(v.grantsActive), color: accent },
        ]}
      />,
      size,
    );
  }
  const [row] = await db.select({ published: books.published }).from(books).where(eq(books.owner, owner)).limit(1);
  if (!row || row.published !== 1) return new ImageResponse(<Card eyebrow={`@${handle}`} headline={`@${handle} keeps their register private.`} sub="A register is private unless its owner publishes it." facts={[]} />, size);
  const view = await liveView(owner, { refresh: false });
  if (!view.ok) return new ImageResponse(<Card eyebrow={`@${handle}`} headline="A register on Scrip." sub="" facts={[]} />, size);
  const v = view.value;
  const sweeps = v.arrivals.filter((a) => a.kind === "sweep");
  const landed = sweeps.reduce((n, a) => n + BigInt(a.basisUsdc), 0n);
  const paid = v.arrivals.reduce((n, a) => n + BigInt(a.paidUsdc), 0n);
  const units = v.asset ? v.arrivals.filter((a) => a.asset === v.asset?.mint).reduce((n, a) => n + BigInt(a.amountRaw), 0n) : 0n;
  const held = v.asset ? (() => {
    const hh = v.holdings.find((x) => x.mint === v.asset?.mint);
    const bal = hh ? BigInt(hh.qtyRaw) : 0n;
    return units > 0n ? Number(((bal < units ? bal : units) * 10_000n) / units) : null;
  })() : null;
  const facts = [
    ...(landed > 0n ? [{ k: "Landed", v: usdc(landed) }] : []),
    { k: "Became stock", v: usdc(paid) },
    ...(v.asset ? [{ k: v.asset.symbol, v: unitsFromRaw(units, v.asset.decimals), color: accent }] : []),
    ...(held !== null ? [{ k: "Still held", v: bps(held), color: ok }] : []),
  ];
  return new ImageResponse(
    <Card eyebrow={`@${handle}, live`} headline={v.ruleOn && v.asset ? `${bps(v.rateNowBps)} of every arrival becomes ${v.asset.symbol}.` : "The rule is off."} sub={v.arrivals.length === 0 ? "Nothing has arrived under the rule yet." : `${v.arrivals.length} receipt${v.arrivals.length === 1 ? "" : "s"}, each an account anyone can open.`} facts={facts} />,
    size,
  );
}
