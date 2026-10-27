"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, Save, RotateCcw } from "lucide-react";

import { ResumeCreatorAtsPane } from "@/components/resume-creator/ats-pane";
import { ResumeCreatorLeftPane } from "@/components/resume-creator/left-pane";
import { ResumeCreatorPreview } from "@/components/resume-creator/preview-pane";
import { ShellWidth } from "@/components/shell-width";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { FEATURES } from "@/lib/features";
import { authClient } from "@/lib/auth-client";
import {
  clearDraftStorage,
  createEmptyDraft,
  createSampleDraft,
  draftToPlainText,
  loadDraftFromStorage,
  loadPanelLayout,
  saveDraftToStorage,
  savePanelLayout,
  suggestedDisplayName,
  type PanelLayout,
} from "@/lib/resume-creator-draft";
import { downloadResumeCreatorPdf, resumeCreatorPdfBlob } from "@/lib/resume-creator-pdf";
import type { ResumeCreatorDraft } from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

type Props = {
  yearsExperience: number | null;
};

export function ResumeCreator({ yearsExperience }: Props) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [draft, setDraft] = useState<ResumeCreatorDraft>(() => createSampleDraft());
  const [hydrated, setHydrated] = useState(false);
  const [panels, setPanels] = useState<PanelLayout>({ left: 25, center: 50, right: 25 });
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const stored = loadDraftFromStorage();
    if (stored) setDraft(stored);
    setPanels(loadPanelLayout());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = window.setTimeout(() => saveDraftToStorage(draft), 250);
    return () => window.clearTimeout(t);
  }, [draft, hydrated]);

  const onDraftChange = useCallback((next: ResumeCreatorDraft) => {
    setDraft(next);
    setMessage(null);
  }, []);

  async function handleDownload() {
    setDownloading(true);
    setMessage(null);
    try {
      await downloadResumeCreatorPdf(draft);
      setMessage({ kind: "ok", text: "PDF downloaded." });
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Download failed.",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    if (!signedIn) {
      setMessage({
        kind: "err",
        text: "Sign in to save this resume to your Documents.",
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const blob = await resumeCreatorPdfBlob(draft);
      const file = new File([blob], `${suggestedDisplayName(draft)}.pdf`, {
        type: "application/pdf",
      });
      const form = new FormData();
      form.set("file", file);
      form.set("displayName", suggestedDisplayName(draft));
      form.set("extractedText", draftToPlainText(draft));
      form.set("makeActive", "true");
      const res = await fetch("/api/resume-creator/save", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; resume?: { displayName: string } };
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setMessage({
        kind: "ok",
        text: `Saved “${data.resume?.displayName ?? "resume"}” to Documents.`,
      });
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    clearDraftStorage();
    setDraft(createEmptyDraft());
    setMessage({ kind: "ok", text: "Draft cleared on this device." });
  }

  const Icon = FEATURES.createResume.icon;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleDownload()}
        loading={downloading}
        loadingText="Downloading…"
      >
        <Download className="size-3.5" />
        Download PDF
      </Button>
      {signedIn ? (
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          loading={saving}
          loadingText="Saving…"
        >
          <Save className="size-3.5" />
          Save to Documents
        </Button>
      ) : (
        <Link
          href="/sign-in?next=/resume-creator"
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          <Save className="size-3.5" />
          Sign in to save
        </Link>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
        <RotateCcw className="size-3.5" />
        Reset draft
      </Button>
    </div>
  );

  return (
    <ShellWidth className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-3 py-4 sm:py-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
            <Icon className="size-3.5" aria-hidden />
            Resume
          </p>
          <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            {FEATURES.createResume.label}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-[13px] leading-snug">
            {FEATURES.createResume.description} Drafts stay on this device until you save. Download
            works signed out; save and ATS scoring need an account.
          </p>
        </div>
        {toolbar}
      </header>

      {message ? (
        <Alert variant={message.kind === "err" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {sessionPending || !hydrated ? (
        <div className="border-border bg-card text-muted-foreground flex min-h-[28rem] items-center justify-center rounded-lg border text-[13px]">
          Loading editor…
        </div>
      ) : narrow ? (
        <div className="flex flex-col gap-3">
          <div className="border-border bg-card min-h-[28rem] overflow-hidden rounded-lg border p-3">
            <ResumeCreatorLeftPane draft={draft} onChange={onDraftChange} />
          </div>
          <div className="border-border bg-card min-h-[32rem] overflow-hidden rounded-lg border p-3">
            <ResumeCreatorPreview draft={draft} />
          </div>
          <div className="border-border bg-card min-h-[28rem] overflow-hidden rounded-lg border p-3">
            <ResumeCreatorAtsPane
              draft={draft}
              onDraftChange={onDraftChange}
              signedIn={signedIn}
              yearsExperience={yearsExperience}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1" style={{ minHeight: "36rem" }}>
          <ResizablePanelGroup
            orientation="horizontal"
            variant="blocks"
            className="h-full min-h-[36rem]"
            onLayoutChanged={(layout) => {
              const next = {
                left: Number(layout.left ?? panels.left),
                center: Number(layout.center ?? panels.center),
                right: Number(layout.right ?? panels.right),
              };
              setPanels(next);
              savePanelLayout(next);
            }}
          >
            <ResizablePanel
              id="left"
              defaultSize={`${panels.left}`}
              minSize="18"
              className="flex flex-col p-3"
            >
              <ResumeCreatorLeftPane draft={draft} onChange={onDraftChange} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="center"
              defaultSize={`${panels.center}`}
              minSize="30"
              className="flex flex-col p-3"
            >
              <ResumeCreatorPreview draft={draft} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="right"
              defaultSize={`${panels.right}`}
              minSize="18"
              className="flex flex-col p-3"
            >
              <ResumeCreatorAtsPane
                draft={draft}
                onDraftChange={onDraftChange}
                signedIn={signedIn}
                yearsExperience={yearsExperience}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </ShellWidth>
  );
}
