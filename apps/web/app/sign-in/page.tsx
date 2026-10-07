import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { SignInForm } from "@/components/sign-in-form";
import { isGoogleAuthConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 sm:px-6 sm:py-24">
        <Link href="/" className="relative mb-7">
          <div
            className="absolute inset-[-18%] rounded-[2rem] opacity-70 blur-3xl"
            style={{ background: "var(--glow)" }}
            aria-hidden
          />
          <Image
            src="/brand/icon.png"
            alt="Avsar"
            width={80}
            height={80}
            className="relative shadow-2xl shadow-black/40"
            priority
          />
        </Link>
        <p className="text-primary/90 mb-2 font-mono text-sm tracking-wide" lang="sa">
          अवसर
        </p>
        <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Sign in to Avsar</h1>
        <p className="text-muted-foreground mt-3 max-w-sm text-center text-sm leading-relaxed">
          Avsar recommends and prepares. The user decides and sends.
        </p>
        <div className="border-border/80 bg-card/70 ring-ring/10 mt-8 w-full rounded-2xl border p-5 shadow-sm ring-1 backdrop-blur-sm">
          <SignInForm googleConfigured={isGoogleAuthConfigured} />
        </div>
        <p className="text-muted-foreground mt-8 text-center text-xs">
          Google only for now — no email/password.{" "}
          <Link href="/" className="text-primary underline underline-offset-2 hover:opacity-90">
            Back home
          </Link>
        </p>
      </div>
    </div>
  );
}
