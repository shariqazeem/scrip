import type { Metadata } from "next";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { PayOne } from "@/components/org/pay-one";
import { currentOwner } from "@/lib/session/server";
import { cluster } from "@/lib/solana/cluster";
import { siteUrl } from "@/lib/site";
import "@/components/org/org.css";
import "../../../pay/pay.css";

export const metadata: Metadata = { title: "Pay one" };
export const dynamic = "force-dynamic";

export default async function PayOnePage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Pay one person in ownership." sub="Sign in with the wallet that pays.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  return (
    <PageFrame eyebrow="Pay in stock" title="Pay one." sub="A handle or an address, an amount, the split, a reason. The stock lands in their own wallet with a receipt; the rest lands as USDC in the same transaction." actions={<SignOut />}>
      <PayOne owner={owner} cluster={cluster()} site={siteUrl()} />
    </PageFrame>
  );
}
