"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { GMAIL_REAUTH_PARAMS, GMAIL_REAUTH_SCOPES, GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";
import { cn } from "@/lib/utils";

export type GmailStatusDto = {
  connected: boolean;
  hasRefreshToken: boolean;
  hasSendScope: boolean;
  ready: boolean;
  reason: string | null;
  requiredScope?: string;
};

type Props = {
  className?: string;
  /** Where to return after Google re-consent. */
  callbackURL?: string;
};

export function GmailConnectBanner({ className, callbackURL = "/referrals" }: Props) {
  const [status, setStatus] = useState<GmailStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/status");
      const data = (await res.json()) as GmailStatusDto & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not check Gmail status.");
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check Gmail status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connectGmail() {
    setPending(true);
    setError(null);
    try {
      await authClient.linkSocial({
        provider: "google",
        scopes: [...GMAIL_REAUTH_SCOPES],
        additionalParams: { ...GMAIL_REAUTH_PARAMS },
        callbackURL,
        errorCallbackURL: callbackURL,
      });
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Google re-authorization failed.");
    }
  }

  // Only surface UI when Gmail send is missing — hide success / loading chrome.
  if (loading || status?.ready) {
    return null;
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3",
        className,
      )}
      role="alert"
    >
      <p className="text-foreground text-[12px] font-semibold">Gmail send not authorized</p>
      <p className="text-muted-foreground text-[12px] leading-relaxed">
        {status?.reason ||
          error ||
          "Allow Aavedak to send email as you (gmail.send + offline access) so queued outreach can leave your inbox. Google may show “Google hasn’t verified this app” — choose Advanced → Continue."}
      </p>
      <p className="text-muted-foreground break-all font-mono text-[10px]">
        Scope: {status?.requiredScope || GMAIL_SEND_SCOPE}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" loading={pending} onClick={() => void connectGmail()}>
          {pending ? "Opening Google…" : "Authorize Gmail send"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void refresh()}
        >
          Recheck
        </Button>
      </div>
      {error ? <p className="text-destructive text-[11px]">{error}</p> : null}
    </div>
  );
}
