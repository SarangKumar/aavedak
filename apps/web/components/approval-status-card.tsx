"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  useGetApprovalStatusQuery,
  useLazyGetApprovalStatusQuery,
  useReRequestAccessMutation,
} from "@/lib/store/approval-api";

type Props = {
  initialStatus: "pending" | "rejected";
  email: string;
  firstName?: string | null;
};

export function ApprovalStatusCard({ initialStatus, email, firstName }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"pending" | "rejected">(initialStatus);

  const { data, isFetching, isError } = useGetApprovalStatusQuery(undefined, {
    pollingInterval: phase === "pending" ? 12_000 : 0,
    refetchOnFocus: phase === "pending",
    refetchOnReconnect: phase === "pending",
    skip: phase === "rejected",
  });

  const [triggerCheck, lazy] = useLazyGetApprovalStatusQuery();
  const [reRequest, reRequestState] = useReRequestAccessMutation();

  useEffect(() => {
    if (!data?.status) return;
    if (data.status === "approved") {
      router.replace(data.next || "/onboarding");
      return;
    }
    if (data.status === "pending" || data.status === "rejected") {
      setPhase(data.status);
    }
  }, [data, router]);

  const checking = isFetching || lazy.isFetching;
  const errMsg =
    isError || lazy.isError
      ? "Could not check status. Try Check again."
      : reRequestState.isError
        ? "Could not send request. Try again."
        : null;

  if (phase === "rejected") {
    return (
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <BrandMark width={64} height={64} className="mb-5 size-16" priority />
        <p className="text-primary/90 mb-1 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-2xl tracking-tight sm:text-3xl">
          Access not approved
        </h1>
        <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
          Sorry{firstName ? `, ${firstName}` : ""}. An admin did not approve{" "}
          <span className="text-foreground font-medium">{email}</span>. You can request access again
          — it will go back to the admin queue.
        </p>
        {errMsg ? (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{errMsg}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          className="mt-8 w-full max-w-xs"
          loading={reRequestState.isLoading}
          loadingText="Sending…"
          onClick={() => {
            void reRequest()
              .unwrap()
              .then((res) => {
                if (res.status === "approved") {
                  router.replace("/onboarding");
                  return;
                }
                setPhase("pending");
              });
          }}
        >
          Request access again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center text-center">
      <BrandMark width={64} height={64} className="mb-5 size-16" priority />
      <p className="text-primary/90 mb-1 font-mono text-[12px] tracking-wide" lang="hi">
        आवेदक
      </p>
      <h1 className="aavedak-display text-foreground text-2xl tracking-tight sm:text-3xl">
        Waiting for approval
      </h1>
      <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
        Thanks{firstName ? `, ${firstName}` : ""}. Your sign-in worked — an admin needs to approve{" "}
        <span className="text-foreground font-medium">{email}</span> before you can start
        onboarding.
      </p>
      <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
        Status updates automatically. Use Check again anytime.
      </p>
      {errMsg ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        className="mt-8"
        loading={checking}
        loadingText="Checking…"
        onClick={() => {
          void triggerCheck()
            .unwrap()
            .then((res) => {
              if (res.status === "approved") {
                router.replace(res.next || "/onboarding");
                return;
              }
              if (res.status === "rejected") setPhase("rejected");
            });
        }}
      >
        Check again
      </Button>
    </div>
  );
}
