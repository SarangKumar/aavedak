import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { SignInForm } from "@/components/sign-in-form";
import { isGoogleAuthConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Arambh with Google to manage your job search, applications, and documents.",
};

export default function SignInPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="avsar-fade-up relative mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 sm:px-6 sm:py-16">
        <Link href="/" className="group relative mb-6" aria-label="Arambh home">
          <div
            className="absolute inset-[-18%] rounded-[2rem] opacity-70 blur-3xl"
            style={{ background: "var(--glow)" }}
            aria-hidden
          />
          <Image
            src="/brand/logo-icon.png"
            alt="Arambh logo"
            width={72}
            height={72}
            className="avsar-logo relative"
            priority
          />
        </Link>
        <p className="text-primary/90 mb-1.5 font-mono text-[13px] tracking-wide" lang="hi">
          आरंभ
        </p>
        <h1 className="avsar-display text-foreground text-xl sm:text-2xl">Sign in to Arambh</h1>
        <p className="text-muted-foreground mt-2.5 max-w-sm text-center text-[13px] leading-relaxed">
          Arambh recommends and prepares. The user decides and sends.
        </p>
        <div className="border-border/80 bg-card/70 ring-ring/10 mt-6 w-full rounded-2xl border p-3.5 shadow-sm ring-1 backdrop-blur-sm sm:p-4">
          <SignInForm googleConfigured={isGoogleAuthConfigured} />
        </div>
        <p className="text-muted-foreground mt-6 text-center text-[11px]">
          Google only for now — no email/password.{" "}
          <Link href="/" className="text-primary underline underline-offset-2 hover:opacity-90">
            Back home
          </Link>
        </p>
      </div>
    </div>
  );
}
