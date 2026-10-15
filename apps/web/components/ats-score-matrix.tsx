"use client";

import type { ReactNode } from "react";

import { FinalScoreCell } from "@/components/final-score-cell";
import type { FinalScoreEntry } from "@/lib/ats-engines/aggregate";
import { ResumePreviewButton } from "@/components/resume-preview";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AtsEngineId } from "@/lib/ats-engines/types";

export type AtsMatrixEngine = { id: AtsEngineId; header: ReactNode };
export type AtsMatrixResume = { id: string; displayName: string; status: string };

/**
 * Resume × engine score table used by the ATS page and each job's ATS check. Resumes with
 * status "active" get a primary-coloured frame around the whole row.
 */
export function AtsScoreMatrix<R extends AtsMatrixResume>({
  engines,
  resumes,
  renderCell,
  finalScores,
  renderResumeLeading,
  renderRowActions,
  onPreview,
}: {
  engines: AtsMatrixEngine[];
  resumes: R[];
  /** Cell content for one resume × engine; the caller owns score rings, spinners and details. */
  renderCell: (resumeId: string, engineId: AtsEngineId) => ReactNode;
  /** Scores that feed the Final score cell; `null` leaves it empty. */
  finalScores: (resumeId: string) => FinalScoreEntry[] | null;
  /** Optional control shown before the resume name, such as an include checkbox. */
  renderResumeLeading?: (resume: R) => ReactNode;
  /** Optional controls at the end of the resume cell, such as download buttons. */
  renderRowActions?: (resume: R) => ReactNode;
  /** Shows a preview button on each row when set. */
  onPreview?: (resume: R) => void;
}) {
  return (
    <ScrollArea orientation="horizontal" className="border-border/60 rounded-lg border">
      {/* Fixed layout: equal-width engine columns so score rings form an even grid. */}
      <table
        className="w-full table-fixed border-collapse text-[12px]"
        style={{ minWidth: `${Math.max(36, 11 + engines.length * 7.5)}rem` }}
      >
        <colgroup>
          <col className="w-36 sm:w-44" />
          {engines.map((eng) => (
            <col key={eng.id} />
          ))}
          <col className="w-32 sm:w-40" />
        </colgroup>
        <thead>
          <tr className="border-border/50 border-b">
            <th className="text-muted-foreground bg-card after:bg-border/60 sticky left-0 z-10 px-3 py-2.5 text-center align-middle font-medium after:absolute after:inset-y-0 after:right-0 after:w-px">
              Resume
            </th>
            {engines.map((eng) => (
              <th
                key={eng.id}
                className="text-muted-foreground px-2 py-2.5 text-center align-middle font-medium"
              >
                {eng.header}
              </th>
            ))}
            <th className="text-muted-foreground bg-card before:bg-border/60 sticky right-0 z-10 px-2 py-2.5 text-center align-middle font-medium before:absolute before:inset-y-0 before:left-0 before:w-px">
              Final score
            </th>
          </tr>
        </thead>
        <tbody>
          {resumes.map((resume) => {
            const scores = finalScores(resume.id);
            return (
              <tr key={resume.id} className="border-border/20 border-b last:border-b-0">
                <td className="bg-card after:bg-border/60 sticky left-0 z-10 px-3 py-2.5 align-middle after:absolute after:inset-y-0 after:right-0 after:w-px">
                  <div className="flex min-w-0 items-center gap-2">
                    {renderResumeLeading?.(resume)}
                    <span className="text-foreground min-w-0 truncate font-medium">
                      {resume.displayName}
                    </span>
                    {resume.status === "active" ? (
                      <Badge variant="default" className="shrink-0 px-1 py-0 text-[9px]">
                        Active
                      </Badge>
                    ) : null}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {onPreview ? (
                        <ResumePreviewButton
                          resumeName={resume.displayName}
                          onClick={() => onPreview(resume)}
                        />
                      ) : null}
                      {renderRowActions?.(resume)}
                    </span>
                  </div>
                </td>
                {engines.map((eng) => (
                  <td key={eng.id} className="p-0 align-middle">
                    {renderCell(resume.id, eng.id)}
                  </td>
                ))}
                <td className="bg-card before:bg-border/60 sticky right-0 z-10 h-12 px-2 align-middle before:absolute before:inset-y-0 before:left-0 before:w-px">
                  {scores ? <FinalScoreCell entries={scores} /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}
