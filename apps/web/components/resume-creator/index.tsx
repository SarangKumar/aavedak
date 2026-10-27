"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, Save, RotateCcw } from "lucide-react";

import { BoardToggleButton, FullscreenBoard } from "@/components/fullscreen-board";
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

/**
 * Fixed viewport-height shell (Jobs-style): panes share one height; each scrolls inside.
 * Draft lives in localStorage so signing in does not wipe it.
 */
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
  const [fullscreen, setFullscreen] = useState(false);

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
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

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
      <BoardToggleButton
        expanded={fullscreen}
        onClick={() => setFullscreen((v) => !v)}
        label="create resume"
        showOnMobile
      />
    </div>
  );

  const board: ReactNode =
    sessionPending || !hydrated ? (
      <div className="border-border bg-card text-muted-foreground flex min-h-0 flex-1 items-center justify-center rounded-lg border text-[13px]">
        Loading editor…
      </div>
    ) : narrow ? (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        <div className="border-border bg-card h-[min(70vh,36rem)] shrink-0 overflow-hidden rounded-lg border p-3">
          <ResumeCreatorLeftPane draft={draft} onChange={onDraftChange} signedIn={signedIn} />
        </div>
        <div className="border-border bg-card h-[min(80vh,40rem)] shrink-0 overflow-hidden rounded-lg border p-3">
          <ResumeCreatorPreview draft={draft} />
        </div>
        <div className="border-border bg-card h-[min(70vh,36rem)] shrink-0 overflow-hidden rounded-lg border p-3">
          <ResumeCreatorAtsPane
            draft={draft}
            onDraftChange={onDraftChange}
            signedIn={signedIn}
            yearsExperience={yearsExperience}
          />
        </div>
      </div>
    ) : (
      // Same idea as Jobs: fixed height under the page chrome; panes scroll inside.
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          orientation="horizontal"
          variant="blocks"
          className="h-full w-full"
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
            className="flex min-h-0 flex-col overflow-hidden p-3"
          >
            <ResumeCreatorLeftPane draft={draft} onChange={onDraftChange} signedIn={signedIn} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="center"
            defaultSize={`${panels.center}`}
            minSize="30"
            className="flex min-h-0 flex-col overflow-hidden p-3"
          >
            <ResumeCreatorPreview draft={draft} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="right"
            defaultSize={`${panels.right}`}
            minSize="18"
            className="flex min-h-0 flex-col overflow-hidden p-3"
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
    );

  if (fullscreen) {
    return (
      <FullscreenBoard className="gap-2">
        <header className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-muted-foreground mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
              <Icon className="size-3.5" aria-hidden />
              Resume
            </p>
            <h1 className="text-foreground text-lg font-semibold tracking-tight sm:text-xl">
              {FEATURES.createResume.label}
            </h1>
          </div>
          {toolbar}
        </header>
        {message ? (
          <Alert variant={message.kind === "err" ? "destructive" : "default"} className="shrink-0">
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}
        {board}
      </FullscreenBoard>
    );
  }

  return (
    <ShellWidth className="flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col gap-3 overflow-hidden py-4 sm:py-5">
      <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
            <Icon className="size-3.5" aria-hidden />
            Resume
          </p>
          <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            {FEATURES.createResume.label}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-[13px] leading-snug">
            {FEATURES.createResume.description} Drafts stay on this device (including across
            sign-in). Download works signed out; save and ATS scoring need an account.
          </p>
        </div>
        {toolbar}
      </header>

      {message ? (
        <Alert variant={message.kind === "err" ? "destructive" : "default"} className="shrink-0">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {board}
    </ShellWidth>
  );
}
