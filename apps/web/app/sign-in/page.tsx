import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { SignInForm } from "@/components/sign-in-form";
import { getOptionalAccess } from "@/lib/app-access";
import { isGoogleAuthConfigured } from "@/lib/auth";
import { hasFullyOnboarded } from "@/lib/onboarding";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Sign in",
  description: "Sign in to Aavedak with Google to continue your job search.",
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const access = await getOptionalAccess();
  if (access) {
    const { profile, user } = access;
    if (profile.approvalStatus === "pending" || profile.approvalStatus === "rejected") {
      redirect("/pending-approval");
    }
    const next = params.next?.startsWith("/") ? params.next : null;
    if (next && next !== "/sign-in" && (await hasFullyOnboarded(user.id))) {
      redirect(next);
    }
    if (await hasFullyOnboarded(user.id)) {
      redirect("/dashboard");
    }
    redirect("/onboarding");
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-3rem)] items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--mesh-a),transparent_65%)] opacity-90"
      />
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="aavedak-fade-up max-w-88 relative flex w-full flex-col items-center text-center">
        <Link href="/" className="group relative mb-7" aria-label="Aavedak home">
          <span className="aavedak-logo-glow" aria-hidden />
          <BrandMark
            alt=""
            width={88}
            height={88}
            className="relative h-[4.5rem] w-[4.5rem] sm:h-[5.5rem] sm:w-[5.5rem]"
            priority
          />
        </Link>

        <p className="text-primary/90 mb-1 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-2xl tracking-tight sm:text-3xl">
          Aavedak
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[18rem] text-[13px] leading-relaxed">
          Sign in to continue. We prepare — you decide and send.
        </p>

        <Card className="border-border/70 bg-card/90 mt-8 w-full gap-0 rounded-2xl border p-4 shadow-sm backdrop-blur-md sm:p-5">
          <SignInForm googleConfigured={isGoogleAuthConfigured} />
        </Card>

        <p className="text-muted-foreground mt-6 text-[11px] leading-relaxed">
          <Link
            href="/privacy"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            Privacy
          </Link>
          <span className="text-border mx-2" aria-hidden>
            ·
          </span>
          <Link href="/terms" className="hover:text-foreground underline-offset-2 hover:underline">
            Terms
          </Link>
          <span className="text-border mx-2" aria-hidden>
            ·
          </span>
          <Link href="/" className="hover:text-foreground underline-offset-2 hover:underline">
            Home
          </Link>
        </p>
      </div>
    </div>
  );
}
