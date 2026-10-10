"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  GMAIL_READ_REAUTH_SCOPES,
  GMAIL_REAUTH_PARAMS,
  GMAIL_REAUTH_SCOPES,
  GMAIL_SEND_SCOPE,
} from "@/lib/gmail-scopes";

export type GmailStatusDto = {
  connected: boolean;
  hasRefreshToken: boolean;
  hasSendScope: boolean;
  ready: boolean;
  readReady?: boolean;
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
    <Alert className={className}>
      <AlertTitle>Gmail send not authorized</AlertTitle>
      <AlertDescription>
        {status?.reason ||
          error ||
          "Allow Aavedak to send email as you (gmail.send + offline access) so queued outreach can leave your inbox. Google may show “Google hasn’t verified this app” — choose Advanced → Continue."}
      </AlertDescription>
      <AlertDescription className="break-all font-mono text-[10px]">
        Scope: {status?.requiredScope || GMAIL_SEND_SCOPE}
      </AlertDescription>
      <div className="col-span-full flex flex-wrap items-center gap-2 pt-1">
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
      {error ? (
        <AlertDescription className="text-destructive col-span-full">{error}</AlertDescription>
      ) : null}
    </Alert>
  );
}

/**
 * Optional second consent for reply detection (gmail.readonly). Sending never needs it, so this
 * only asks when sending already works and reading has not been granted yet.
 */
export function ReplyDetectionBanner({
  readReady,
  callbackURL = "/outreach",
  className,
}: {
  readReady: boolean;
  callbackURL?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (readReady) return null;

  async function enableReplies() {
    setPending(true);
    setError(null);
    try {
      await authClient.linkSocial({
        provider: "google",
        scopes: [...GMAIL_READ_REAUTH_SCOPES],
        additionalParams: { ...GMAIL_REAUTH_PARAMS },
        callbackURL,
        errorCallbackURL: callbackURL,
      });
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Google authorization failed.");
    }
  }

  return (
    // Info notice: the Vinyaas Alert's default variant with an info icon.
    <Alert className={className}>
      <InfoIcon className="size-4" />
      <AlertTitle>Reply detection is off</AlertTitle>
      <AlertDescription>
        Authorize reply detection to see replies to your mails here. Sending does not need it.
      </AlertDescription>
      <div className="col-span-full flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() => void enableReplies()}
        >
          Authorize reply detection
        </Button>
      </div>
      {error ? (
        <AlertDescription className="text-destructive col-span-full">{error}</AlertDescription>
      ) : null}
    </Alert>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
