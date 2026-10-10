"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type SignInFormProps = {
  googleConfigured: boolean;
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

export function SignInForm({ googleConfigured }: SignInFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    setError(null);
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/auth/continue",
        newUserCallbackURL: "/auth/continue?next=/onboarding",
      });
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
    }
  }

  if (!googleConfigured) {
    return (
      <div className="space-y-2 text-left">
        <p className="text-foreground text-[13px] font-medium">Google sign-in isn’t configured</p>
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Set <code className="font-mono text-[11px]">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono text-[11px]">GOOGLE_CLIENT_SECRET</code> in{" "}
          <code className="font-mono text-[11px]">apps/web/.env.local</code>, then restart the app.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={pending}
        loadingText="Redirecting…"
        onClick={() => void continueWithGoogle()}
      >
        <GoogleMark className="size-4 shrink-0" />
        Continue with Google
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
