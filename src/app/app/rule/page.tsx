import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { PageFrame } from "@/components/app/page-frame";
import { RuleEditor } from "@/components/app/rule-editor";
import { SignOut } from "@/components/auth/connect";
import { ruleAssets } from "@/lib/assets/registry";
import { loadBook } from "@/lib/book/read-book";
import { currentOwner } from "@/lib/session/server";

export const metadata: Metadata = { title: "The rule" };
export const dynamic = "force-dynamic";

/**
 * THE RULE — turn on, change, pause. "Choose the share of your income you never want to
 * think about again." Rate as three large presets and a slider to 50%; asset; optional
 * floor and cap; escalation as one checkbox; the allowance with a plain explanation of what
 * the delegate can and cannot do; the float with "about N sweeps". One signature.
 */
export default async function RulePage() {
  const owner = await currentOwner();
  const assets = ruleAssets();
  if (!owner) {
    // The question first, the wallet second: choose a rate before anything asks for a signature.
    return (
      <PageFrame eyebrow="The rule" title="The share of your income you never want to think about again." sub="A habit, not a trading setting. Payers keep sending USDC to the address you already use; a slice of every inflow becomes stock in this wallet, with a receipt.">
        <RuleEditor owner={null} view={null} assets={assets.map(opt)} />
      </PageFrame>
    );
  }
  const view = await loadBook(owner);
  return (
    <PageFrame
      eyebrow="The rule"
      title="The share of your income you never want to think about again."
      sub="A habit, not a trading setting. Payers keep sending USDC to this address; a slice of every inflow becomes stock in this wallet, with a receipt."
      actions={<SignOut />}
    >
      {!view.ok ? (
        <div className="sp-held">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden />
          <span>{view.why}</span>
        </div>
      ) : (
        <RuleEditor
          owner={owner}
          view={{
            hasBook: view.value.book !== null,
            slug: view.value.book?.slug ?? null,
            assetMint: view.value.asset?.mint ?? null,
            state: view.value.state,
            rule: view.value.book
              ? {
                  enabled: view.value.book.rule.enabled,
                  rateBps: view.value.book.rule.rateBps,
                  escalateBps: view.value.book.rule.escalateBps,
                  floorUsdc: view.value.book.rule.floorUsdc.toString(),
                  capUsdc: view.value.book.rule.capUsdc.toString(),
                  toleranceBps: view.value.book.rule.toleranceBps,
                }
              : null,
            usdcBalance: view.value.usdc.balance.toString(),
            usdcExists: view.value.usdc.exists,
            delegatedAmount: view.value.usdc.delegatedAmount.toString(),
            floatLamports: view.value.floatLamports.toString(),
            sweepsCovered: view.value.sweepsCovered,
            ownerLamports: view.value.ownerLamports.toString(),
            openCostLamports: view.value.openCostLamports.toString(),
          }}
          assets={[...assets, ...(view.value.asset && !assets.some((a) => a.mint === view.value.asset?.mint) ? [view.value.asset] : [])].map(opt)}
        />
      )}
    </PageFrame>
  );
}

function opt(a: ReturnType<typeof ruleAssets>[number]) {
  return { mint: a.mint, symbol: a.symbol, name: a.name, singleName: a.singleName, xstocks: a.issuer.name.includes("xStocks"), issuer: a.issuer.name, kind: a.kind };
}
