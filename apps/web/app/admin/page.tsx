import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { getAdminEmails, isAdminEmail } from "@/lib/admin";
import { getAdminOverviewCounts, listRecentResumesForAdmin } from "@/lib/admin-data";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Admin",
  description: "Aavedak admin tools (allowlisted emails only).",
};

export default async function AdminPage() {
  const { user } = await requireOnboarded();
  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  const counts = getAdminOverviewCounts();
  const resumes = listRecentResumesForAdmin(50);
  const allowlist = getAdminEmails();

  return (
    <AdminShell adminEmail={user.email} allowlist={allowlist} counts={counts} resumes={resumes} />
  );
}
