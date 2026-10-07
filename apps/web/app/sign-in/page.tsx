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
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 sm:px-6 sm:py-24">
      <Link href="/" className="relative mb-6">
        <div className="bg-primary/10 absolute inset-0 rounded-2xl blur-2xl" aria-hidden />
        <Image
          src="/brand/icon.png"
          alt="Avsar"
          width={72}
          height={72}
          className="ring-border relative rounded-2xl shadow-lg ring-1"
          priority
        />
      </Link>
      <p className="text-muted-foreground mb-2 font-mono text-sm" lang="sa">
        अवसर
      </p>
      <h1 className="text-foreground text-2xl font-semibold tracking-tight">Sign in to Avsar</h1>
      <p className="text-muted-foreground mt-3 max-w-sm text-center text-sm leading-relaxed">
        Avsar recommends and prepares. The user decides and sends.
      </p>
      <div className="mt-8 w-full">
        <SignInForm googleConfigured={isGoogleAuthConfigured} />
      </div>
      <p className="text-muted-foreground mt-8 text-center text-xs">
        Google only for now — no email/password.{" "}
        <Link href="/" className="text-foreground underline underline-offset-2">
          Back home
        </Link>
      </p>
    </div>
  );
}
