"use client";

import Link from "next/link";
import { useState } from "react";

import { ShellWidth } from "@/components/shell-width";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ResumeRow = {
  id: string;
  displayName: string;
  status: string;
  atsScore: number | null;
  byteSize: number;
  updatedAt: string;
};

type JdScore = {
  atsScore: number;
  resumeMatchScore: number;
  matched: string[];
  missing: string[];
};

type AtsHubProps = {
  initialResumes: ResumeRow[];
};

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5v7M5.5 7.5 8 10l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function AtsHub({ initialResumes }: AtsHubProps) {
  const [jdText, setJdText] = useState("");
  const [scoresById, setScoresById] = useState<Record<string, JdScore | null>>({});
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoredOnce, setScoredOnce] = useState(false);

  async function runScoreAll() {
    const jd = jdText.trim();
    if (!jd) {
      setError("Paste a job description to score your resumes.");
      return;
    }
    if (initialResumes.length === 0) {
      setError("Upload a resume on Documents first.");
      return;
    }

    setScoring(true);
    setError(null);
    setScoredOnce(true);
    setScoresById({});

    try {
      const res = await fetch("/api/ats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText: jd, scoreAll: true }),
      });
      const data = (await res.json()) as {
        results?: Array<{
          resumeId: string;
          againstJd: JdScore | null;
          error?: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Score failed.");

      const next: Record<string, JdScore | null> = {};
      for (const row of data.results ?? []) {
        next[row.resumeId] = row.againstJd;
      }
      setScoresById(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Score failed.");
    } finally {
      setScoring(false);
    }
  }

  return (
    <ShellWidth className="space-y-5 py-6 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">ATS score</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          Paste a job description to score every uploaded resume against it. PDF / DOCX JD upload
          comes later — text for now. Manage files on{" "}
          <Link href="/documents" className="text-primary underline underline-offset-2">
            Documents
          </Link>
          .
        </p>
      </header>

      <section className="border-border/80 bg-card space-y-3 rounded-xl border p-4">
        <label className="block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Job description</span>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={10}
            placeholder="Paste the JD here…"
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
          />
        </label>
        <p className="text-muted-foreground text-[11px]">
          Upload JD from PDF or DOCX — coming soon.
        </p>
        <Button
          type="button"
          onClick={() => void runScoreAll()}
          disabled={scoring || !jdText.trim() || initialResumes.length === 0}
        >
          {scoring ? "Scoring resumes…" : "Score all resumes"}
        </Button>
        {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-foreground text-[13px] font-semibold">Your resumes</h2>
        {initialResumes.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            No resumes yet — upload one on Documents.
          </p>
        ) : (
          <ul className="space-y-2">
            {initialResumes.map((resume) => {
              const jdScore = scoresById[resume.id];
              return (
                <li
                  key={resume.id}
                  className="border-border/80 bg-card flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {resume.displayName}
                    </p>
                    <p className="text-muted-foreground text-[11px]">{resume.status}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {scoring ? (
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
                        <Spinner className="size-3.5" label="Scoring" />
                        Scoring…
                      </span>
                    ) : scoredOnce && jdScore ? (
                      <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                        ATS {jdScore.atsScore}
                        <span className="text-primary/70 font-medium">
                          {" "}
                          · match {jdScore.resumeMatchScore}
                        </span>
                      </span>
                    ) : scoredOnce ? (
                      <span className="text-muted-foreground text-[11px]">No score</span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Paste a JD to score</span>
                    )}
                    <a
                      href={`/api/resumes/${resume.id}/file`}
                      download
                      title="Download resume"
                      aria-label={`Download ${resume.displayName}`}
                      className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border"
                    >
                      <DownloadIcon className="size-3.5" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </ShellWidth>
  );
}
