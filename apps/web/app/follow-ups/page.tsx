import { redirect } from "next/navigation";

/** @deprecated Use /outreach */
export default function FollowUpsRedirectPage() {
  redirect("/outreach");
}
