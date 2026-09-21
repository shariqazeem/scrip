import type { Metadata } from "next";
import { PageFrame } from "@/components/app/page-frame";
import { Floor } from "@/components/floor/floor";
import { floorView } from "@/lib/floor";

export const metadata: Metadata = { title: "The floor", description: "The network as the chain sees it: the tape, the clock, keep-rate, keepers, corporate actions, the market." };
export const dynamic = "force-dynamic";

/** The same floor as the front door, from inside the app: on paper, under the shell. */
export default async function FloorPage() {
  const view = await floorView();
  return (
    <PageFrame eyebrow="The floor" title="" >
      <Floor view={view} dark={false} />
    </PageFrame>
  );
}
