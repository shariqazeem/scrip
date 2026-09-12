import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";

export const metadata: Metadata = { title: "Your book" };

/**
 * THE BOOK — grams, share-equivalents, dollars last.
 *
 * Nothing renders here until a book exists on chain, because every number on this page is a
 * claim about someone's money. Balances arrive with `open_book` and the valuer
 * (build-order step 2), and every quantity passes through the issuer multiplier first
 * (step 1) — a raw balance painted on this screen is the bug the whole product is built
 * around.
 */
export default function BookPage() {
  return (
    <PageFrame
      eyebrow="Your book"
      title="Grams and the market — in your own wallet."
      sub="Webgold indexes your book; it never holds it. Constituents sit in token accounts you own, and the program keeps the policy and the receipts."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Positions</span>
        </div>
        <EmptyState
          icon={<Wallet size={22} strokeWidth={1.6} />}
          title="No book is open here yet"
          note="A book is opened with a signed mix policy, and its positions are read from the chain. Until one exists there is nothing to show, and nothing will be invented to fill the space."
        />
      </div>
    </PageFrame>
  );
}
