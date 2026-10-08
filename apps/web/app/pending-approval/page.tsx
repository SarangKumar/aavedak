import type { Metadata } from "next";

import { ApprovalStatusCard } from "@/components/approval-status-card";
import { ReduxProvider } from "@/components/redux-provider";
import { requirePendingApprovalSession } from "@/lib/app-access";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Access approval",
  description: "Check whether an admin approved your Aavedak access.",
};

export default async function PendingApprovalPage() {
  const { user, profile } = await requirePendingApprovalSession();
  const status = profile.approvalStatus === "rejected" ? "rejected" : "pending";
  const firstName = user.name?.trim().split(/\s+/)[0] || null;

  return (
    <div className="relative flex min-h-[calc(100dvh-3rem)] items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--mesh-a),transparent_65%)] opacity-90"
      />
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="aavedak-fade-up relative w-full max-w-md">
        <ReduxProvider>
          <ApprovalStatusCard
            initialStatus={status}
            email={profile.email ?? user.email}
            firstName={firstName}
          />
        </ReduxProvider>
      </div>
    </div>
  );
}
