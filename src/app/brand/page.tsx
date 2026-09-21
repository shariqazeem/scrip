import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/wordmark";
import { ScripMark } from "@/components/brand/scrip-mark";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { ExampleStub } from "@/components/stub/stub";

export const metadata: Metadata = { title: "Brand", description: "The wordmark, the mark, the palette, the type, and the one object." };

const PALETTE: ReadonlyArray<[string, string, string]> = [
  ["paper", "#f7f5ef", "the register's ground"],
  ["ink", "#14161c", "text; the floor's ground"],
  ["document blue", "#2b4acb", "the one accent"],
  ["settled green", "#15803d", "money outcomes only"],
  ["failed red", "#dc2626", "money outcomes only"],
  ["gold", "#9a6f1e", "the GOLD chip only"],
];

export default function BrandPage() {
  return (
    <SiteFrame eyebrow="Brand" title="There is no opening bell." lede="The world of the old exchange floor, reborn without hours. The tape is the live feed; the register is the personal record; the stub is the receipt; the floor is the network; the keepers are the runners. Two materials, assigned by surface: ink for the floor, paper for the register.">
      <SiteSection label="The wordmark" aside="Fraunces, in exactly two places">
        <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
          <Wordmark size={56} />
          <span style={{ background: "var(--surface-inverse)", color: "var(--ink-inverse)", padding: "16px 24px", borderRadius: 10 }}>
            <Wordmark size={40} />
          </span>
        </div>
        <p className="sp-body">Set in Fraunces at a heavy optical size, tight: the engraver&rsquo;s serif of a certificate. It appears in the wordmark and on the title line of a statement, nowhere else.</p>
      </SiteSection>
      <SiteSection label="The mark" aside="the stub glyph">
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <ScripMark size={64} />
          <ScripMark size={32} />
          <ScripMark size={20} />
        </div>
        <p className="sp-body">A sheet with a perforated edge and two ruled lines, drawn in the same stroke as the icons beside it. The favicon, the app icon, the bot&rsquo;s avatar, the keeper&rsquo;s health dot.</p>
      </SiteSection>
      <SiteSection label="Palette">
        <div className="sp-truths">
          {PALETTE.map(([name, hex, use]) => (
            <Row key={name} k={name}>
              <span style={{ display: "inline-block", width: 14, height: 14, background: hex, borderRadius: 3, verticalAlign: "middle", marginRight: 8, border: "1px solid var(--border)" }} />
              <span className="mono">{hex}</span> — {use}
            </Row>
          ))}
        </div>
      </SiteSection>
      <SiteSection label="Type">
        <div className="sp-truths">
          <Row k="Words">Instrument Sans, 400 / 500 / 600. Sentence case everywhere. No all-caps eyebrows, no accent-coloured word in a headline.</Row>
          <Row k="Figures">IBM Plex Mono, tabular, at every size. Units are the largest thing on any page they appear on.</Row>
        </div>
      </SiteSection>
      <SiteSection label="The one object" aside="five sizes">
        <div style={{ maxWidth: 440 }}>
          <ExampleStub />
        </div>
        <p className="sp-body">Full, on a receipt page and a statement. Card, in the register. Line, on the tape. Ghost, dashed, for money landed and not yet swept. Share, the image behind every public link. Nothing else on the site is allowed to look like a card: if it is not a stub it is a ruled row or a paragraph.</p>
      </SiteSection>
      <SiteSection label="Voice">
        <p className="sp-body">Declarative, short, no exclamation marks, no “unlock”, no “seamless”. A button says what happens, and the confirmation uses the same word. Nothing is a number the chain cannot back.</p>
      </SiteSection>
    </SiteFrame>
  );
}
