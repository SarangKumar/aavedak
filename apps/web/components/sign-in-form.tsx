"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type SignInFormProps = {
  googleConfigured: boolean;
};

export function SignInForm({ googleConfigured }: SignInFormProps) {
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
      });
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
    }
  }

  if (!googleConfigured) {
    return (
      <div className="space-y-4 text-left">
        <h2 className="text-foreground text-sm font-semibold">Google OAuth not configured</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Add Google Cloud OAuth credentials to{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
            apps/web/.env.local
          </code>{" "}
          then restart{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">pnpm dev</code>.
        </p>
        <ol className="text-muted-foreground list-decimal space-y-2 pl-4 text-sm leading-relaxed">
          <li>
            Create an OAuth client (Web application) in{" "}
            <a
              className="text-primary underline underline-offset-2"
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>
            .
          </li>
          <li>
            Authorized redirect URI:{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              http://localhost:3000/api/auth/callback/google
            </code>
          </li>
          <li>
            Set{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
              GOOGLE_CLIENT_ID
            </code>{" "}
            and{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
              GOOGLE_CLIENT_SECRET
            </code>
            .
          </li>
        </ol>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Also ensure <code className="font-mono">BETTER_AUTH_SECRET</code> (32+ chars) and{" "}
          <code className="font-mono">BETTER_AUTH_URL=http://localhost:3000</code> are set.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={pending}
        className="bg-primary text-primary-foreground ring-primary/30 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg shadow-black/20 ring-1 transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error ? <p className="text-destructive text-center text-sm">{error}</p> : null}
    </div>
  );
}
