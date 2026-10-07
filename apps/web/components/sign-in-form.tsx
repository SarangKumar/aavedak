"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { GOOGLE_SIGN_IN_SCOPES } from "@/lib/google-scopes";
import { cn } from "@/lib/utils";

type SignInFormProps = {
  neonConfigured: boolean;
};

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function SignInForm({ neonConfigured }: SignInFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    setError(null);
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
        scopes: [...GOOGLE_SIGN_IN_SCOPES],
      });
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
    }
  }

  if (!neonConfigured) {
    return (
      <div className="space-y-3 text-left">
        <h2 className="text-foreground text-sm font-semibold">Neon Auth not configured</h2>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Google sign-in is provided by Neon Auth. Copy the branch Auth values into{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
            apps/web/.env.local
          </code>{" "}
          then restart{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">pnpm dev</code>.
        </p>
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed">
          <li>In the Neon Console, enable Auth on the branch and add the Google provider.</li>
          <li>
            Register the Neon redirect URI in Google Cloud and paste the same URI into Neon:{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
              {"{NEON_AUTH_BASE_URL}/callback/google"}
            </code>
            .
          </li>
          <li>
            Set{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              DATABASE_URL
            </code>
            ,{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              NEON_AUTH_BASE_URL
            </code>
            ,{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              NEON_AUTH_JWKS_URL
            </code>
            , and a 32+ character{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              NEON_AUTH_COOKIE_SECRET
            </code>
            .
          </li>
        </ol>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Also set <code className="font-mono">NEXT_PUBLIC_APP_URL</code> to the origin you open in
          the browser, and add that origin as a trusted domain in Neon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={pending}
        className={cn(
          "aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold shadow-md shadow-black/15 ring-1 hover:opacity-90 disabled:opacity-60",
        )}
      >
        {!pending ? <GoogleMark className="size-3.5 shrink-0" /> : null}
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error ? <p className="text-destructive text-center text-[13px]">{error}</p> : null}
    </div>
  );
}
