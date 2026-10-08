"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import type { ApprovalStatus } from "@/lib/user-approval-shared";
import { cn } from "@/lib/utils";

type Props = {
  initialStatus: "pending" | "rejected";
  email: string;
  firstName?: string | null;
};

export function ApprovalStatusCard({ initialStatus, email, firstName }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "rejected" | "approved">(initialStatus);
  const [checking, setChecking] = useState(false);
  const [reRequesting, setReRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/account/approval-status");
      const data = (await res.json()) as {
        status?: ApprovalStatus;
        next?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not check status.");
      if (data.status === "approved") {
        setStatus("approved");
        router.replace(data.next || "/onboarding");
        return;
      }
      if (data.status === "pending" || data.status === "rejected") {
        setStatus(data.status);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check status.");
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    if (status !== "pending") return;
    const id = window.setInterval(() => {
      void refreshStatus();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [status, refreshStatus]);

  async function requestAgain() {
    setReRequesting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/re-request-access", { method: "POST" });
      const data = (await res.json()) as { status?: ApprovalStatus; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not send request.");
      if (data.status === "approved") {
        router.replace("/onboarding");
        return;
      }
      setStatus("pending");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
    } finally {
      setReRequesting(false);
    }
  }

  const isPending = status === "pending";
  const isRejected = status === "rejected";
  const isApproved = status === "approved";

  return (
    <div className="border-border/80 bg-card/95 w-full max-w-md rounded-2xl border p-6 shadow-sm backdrop-blur-md sm:p-7">
      <div className="flex flex-col items-center text-center">
        <BrandMark width={56} height={56} className="mb-4 size-14" priority />
        <p className="text-primary/90 mb-1 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
          {isApproved
            ? "Access approved"
            : isRejected
              ? "Access not approved"
              : "Waiting for approval"}
        </h1>
        <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
          {isApproved ? (
            <>Taking you through…</>
          ) : isRejected ? (
            <>
              Sorry{firstName ? `, ${firstName}` : ""}. An admin did not approve{" "}
              <span className="text-foreground font-medium">{email}</span>. You can request access
              again — it will go back to the admin queue.
            </>
          ) : (
            <>
              Thanks{firstName ? `, ${firstName}` : ""}. Your sign-in worked — an admin needs to
              approve <span className="text-foreground font-medium">{email}</span> before you can
              start onboarding.
            </>
          )}
        </p>
        {isPending ? (
          <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
            This page checks automatically. You can also tap Check again after you hear back.
          </p>
        ) : null}

        {error ? (
          <p className="text-destructive mt-3 text-[12px]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {isPending ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              loading={checking}
              loadingText="Checking…"
              onClick={() => void refreshStatus()}
            >
              Check again
            </Button>
          ) : null}
          {isRejected ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              loading={reRequesting}
              loadingText="Sending…"
              onClick={() => void requestAgain()}
            >
              Request access again
            </Button>
          ) : null}
          <Link
            href="/sign-in"
            className={cn(
              "border-border text-foreground inline-flex h-9 w-full items-center justify-center rounded-md border px-4 text-sm font-medium sm:w-auto",
            )}
          >
            Sign in again
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex h-9 w-full items-center justify-center px-3 text-[13px] sm:w-auto"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
