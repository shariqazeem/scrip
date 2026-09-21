import { redirect } from "next/navigation";

/** The public page moved to /@handle. */
export default async function BookRedirect({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  redirect(`/@${handle}`);
}
