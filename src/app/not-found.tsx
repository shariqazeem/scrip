import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";

/** Nothing at this address. The four places worth going from here, and no apology. */
export default function NotFound() {
  return (
    <PageFrame
      eyebrow="Not here"
      title="Nothing at this address."
      sub="A handle nobody has taken, a receipt that was never written, or a page that has moved. Press ⌘K to jump to a handle, a signature, a run or a grant."
    >
      <div className="sp-actions">
        <Link href="/" className="sp-action is-primary">
          The floor
        </Link>
        <Link href="/ledger" className="sp-action is-quiet">
          The ledger
        </Link>
        <Link href="/app" className="sp-action is-quiet">
          Your register
        </Link>
        <Link href="/docs" className="sp-action is-quiet">
          Docs
        </Link>
      </div>
    </PageFrame>
  );
}
