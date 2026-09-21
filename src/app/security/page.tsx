import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { securityFacts } from "@/lib/security";
import { cluster } from "@/lib/solana/cluster";

export const metadata: Metadata = { title: "Security", description: "Program ids, the upgrade authority, the build hash, what a keeper can and cannot do, what the escrow can and cannot do, and the bug bounty." };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const f = await securityFacts(cluster());
  return (
    <SiteFrame eyebrow="Security" title="What a stranger can check." lede="The program is the rule and the record, never the vault. Everything below is a fact read from the chain or the build, or a sentence about what is not yet done." wide>
      <SiteSection label="The program" aside={f.cluster}>
        <div className="sp-truths">
          <Row k="Program id">
            <span className="mono">{f.programId}</span> · {f.deployed ? "deployed and executable" : "not found on this cluster"}
          </Row>
          <Row k="Program data">
            <span className="mono">{f.programDataAddress}</span>
            {f.dataLength !== null ? ` · ${f.dataLength.toLocaleString("en-US")} bytes of ELF` : ""}
            {f.lastDeploySlot !== null ? ` · last deployed at slot ${f.lastDeploySlot.toLocaleString("en-US")}` : ""}
          </Row>
          <Row k="Upgrade authority">{f.upgradeAuthority ? <><span className="mono">{f.upgradeAuthority}</span> — a key, the deployer&rsquo;s, until the multisig. A multisig, then a freeze, is the plan after Stocklana; until then the program can be changed by that key and this page will say so.</> : f.deployed ? "none: the program is frozen" : "unknown until deployed"}</Row>
          <Row k="Build">{f.buildSha256 ? <><span className="mono">sha256 {f.buildSha256}</span> · {f.buildBytes?.toLocaleString("en-US")} bytes, built on this host from the committed source with Anchor 0.31.1 at opt-level z. A verifiable build (solana-verify) against the deployed bytes is the next step.</> : "the built artefact is not on this host; the hash is published with each deploy"}</Row>
          <Row k="Source"><Link href="/docs">The docs</Link> describe every instruction; the repository is public and the IDL is committed.</Row>
        </div>
      </SiteSection>
      <SiteSection label="What a keeper can and cannot do">
        <ul>
          <li><strong>Cannot choose the amount.</strong> The program computes the slice from on-chain state.</li>
          <li><strong>Cannot skip the check.</strong> <span className="mono">begin_sweep</span> refuses unless a <span className="mono">finish_sweep</span> for the same register and release follows in the same transaction.</li>
          <li><strong>Cannot redirect the output.</strong> The owner&rsquo;s own token account is verified before and after.</li>
          <li><strong>Only discretion: the route,</strong> inside the owner&rsquo;s tolerance against Pyth&rsquo;s price net of confidence.</li>
          <li><strong>Only reward: the tip,</strong> 0.0005 SOL plus the receipt&rsquo;s rent, from the owner&rsquo;s float. The same for a vest, from the grant&rsquo;s float.</li>
        </ul>
      </SiteSection>
      <SiteSection label="What the escrow can and cannot do">
        <ul>
          <li>Scrip holds an asset only in an escrow the payer created, that the recipient can see, and that the payer cannot spend.</li>
          <li>A payment&rsquo;s escrow exists for one transaction, or until a first share is claimed; a gift nobody claims returns to the payer after thirty days.</li>
          <li>A grant&rsquo;s escrow releases on the schedule, to the recipient, or the unvested part back to the payer on a revoke. No instruction sends it anywhere else.</li>
          <li>The rule never holds anything: the owner&rsquo;s USDC and stock sit in the owner&rsquo;s own accounts; the delegate allowance is the owner&rsquo;s to revoke.</li>
        </ul>
      </SiteSection>
      <SiteSection label="What is not done, said plainly">
        <ul>
          <li>No audit. No verifiable build yet. The upgrade authority is a key.</li>
          <li>The legal shape — grants of securities-backed tokens on a schedule, executed by third-party keepers, non-custodial in design — has not been reviewed by a lawyer.</li>
          <li>xStocks carry a permanent delegate and a pause authority: the issuer can move, burn or freeze. Self-custody here means not our custody.</li>
        </ul>
      </SiteSection>
      <SiteSection label="Bug bounty" aside="paid in stock">
        <p className="sp-body">Break the claim flow, take a sponsored position twice, vest more than the schedule, or move an escrow anywhere but where the program says: a write-up with a signature, and a failing test if you can. Paid through <Link href="/bounties" className="sp-inline-link">/bounties</Link>, in SPYx, with a receipt that says what you found.</p>
      </SiteSection>
    </SiteFrame>
  );
}
