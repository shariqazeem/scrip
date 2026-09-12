import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";

export const metadata: Metadata = { title: "Assets" };

/**
 * WHAT A BOOK CAN HOLD — issuer named on every row, wrapper named on every row.
 *
 * Gold is metal or it is not gold: a fund share that tracks bullion never appears under
 * grams. Built out with the asset registry at build-order step 1.
 */
export default function AssetsPage() {
  return (
    <PageFrame
      eyebrow="Assets"
      title="What a book can hold, and whose token it is."
      sub="Every row names the issuer, the wrapper and what the token is actually a claim on. Metal is metal; a fund share that tracks metal is a fund share, and it is labelled one."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Eligible mints</span>
        </div>
        <EmptyState
          icon={<Layers size={22} strokeWidth={1.6} />}
          title="The registry is not published yet"
          note="An asset appears here once its mint, decimals, issuer and multiplier source are all pinned down. A row with a guess in it is worse than no row."
        />
      </div>
    </PageFrame>
  );
}
