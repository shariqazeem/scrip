import { redirect } from "next/navigation";

/** Paying someone lives with the organisation side now. */
export default function SendRedirect() {
  redirect("/app/org/pay");
}
