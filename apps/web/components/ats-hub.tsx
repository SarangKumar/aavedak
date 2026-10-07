"use client";

import Link from "next/link";
import { useState } from "react";

import { ShellWidth } from "@/components/shell-width";
import { Button } from "@/components/ui/button";

type ResumeRow = {
  id: string;
  displayName: string;
  status: string;
  atsScore: number | null;
  byteSize: number;
  updatedAt: string;
};

type AtsHubProps = {
  initialResumes: ResumeRow[];
};

export function AtsHub({ initialResumes }: AtsHubProps) {
  const [resumeId, setResumeId] = useState(initialResumes[0]?.id ?? "");
  const [jdText, setJdText] = useState("");
  const [result, setResult] = useState<{
    readiness?: { atsScore: number; signals: string[]; gaps: string[] };
    againstJd?: {
      atsScore: number;
      resumeMatchScore: number;
      matched: string[];
      missing: string[];
    } | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function runScore() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, jdText }),
      });
      const data = (await res.json()) as typeof result & { error?: string };
      if (!res.ok) throw new Error(data.error || "Score failed.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Score failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ShellWidth className="space-y-5 py-6 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">ATS score</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          Every uploaded resume gets an ATS readiness score on its card. Paste a job description
          here to compare keyword overlap. Limits: 5MB per PDF, 20 uploads per day. Manage files on{" "}
          <Link href="/documents" className="text-primary underline underline-offset-2">
            Documents
          </Link>
          .
        </p>
      </header>

      <section className="border-border/80 bg-card space-y-3 rounded-xl border p-4">
        <label className="block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Resume</span>
          <select
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-2 text-[13px]"
          >
            {initialResumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.displayName}
                {resume.atsScore != null ? ` · ATS ${resume.atsScore}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Job description (optional)</span>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={8}
            placeholder="Paste a JD to score match against the selected resume…"
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px]"
          />
        </label>
        <Button type="button" onClick={() => void runScore()} disabled={!resumeId || pending}>
          {pending ? "Scoring…" : "Score resume"}
        </Button>
        {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      </section>

      {result?.readiness ? (
        <section className="border-border/80 bg-card space-y-2 rounded-xl border p-4">
          <h2 className="text-foreground text-[13px] font-semibold">
            ATS readiness · {result.readiness.atsScore}
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-[12px]">
            {result.readiness.signals.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {result.readiness.gaps.length ? (
            <>
              <p className="text-foreground pt-2 text-[12px] font-medium">Gaps</p>
              <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-[12px]">
                {result.readiness.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {result?.againstJd ? (
        <section className="border-border/80 bg-card space-y-2 rounded-xl border p-4">
          <h2 className="text-foreground text-[13px] font-semibold">
            Vs job description · ATS {result.againstJd.atsScore} · match{" "}
            {result.againstJd.resumeMatchScore}
          </h2>
          <p className="text-muted-foreground text-[12px]">
            Matched: {result.againstJd.matched.join(", ") || "—"}
          </p>
          <p className="text-muted-foreground text-[12px]">
            Missing: {result.againstJd.missing.join(", ") || "—"}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-foreground text-[13px] font-semibold">Your resumes</h2>
        <ul className="space-y-2">
          {initialResumes.map((resume) => (
            <li
              key={resume.id}
              className="border-border/80 bg-card flex items-center justify-between rounded-xl border px-3 py-2"
            >
              <div>
                <p className="text-foreground text-[13px] font-medium">{resume.displayName}</p>
                <p className="text-muted-foreground text-[11px]">{resume.status}</p>
              </div>
              <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
                ATS {resume.atsScore ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </ShellWidth>
  );
}
