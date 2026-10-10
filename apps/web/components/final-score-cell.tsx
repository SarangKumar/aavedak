import { ScoreRing } from "@/components/ui/score-ring";
import { averageScore, scoreVerdict } from "@/lib/ats-types";

/**
 * Fixed rightmost column of the resume × engine tables: the mean of every score that ran
 * for the row. Display only, so it never opens a detail view.
 *
 * Layout: a placeholder is centred in the column. A score is right-aligned, with the verdict
 * in a fixed-width box before the ring so every ring sits on the same vertical line.
 */
export function FinalScoreCell({ scores }: { scores: number[] }) {
  const avg = averageScore(scores);
  if (avg === null) {
    return (
      <div className="flex w-full items-center justify-center">
        <span className="text-muted-foreground text-[11px]">—</span>
      </div>
    );
  }
  return (
    <div
      className="flex w-full items-center justify-end gap-2"
      title={`Average of ${scores.length} score${scores.length === 1 ? "" : "s"}`}
    >
      <span className="text-foreground w-20 text-right text-[12px] font-medium">
        {scoreVerdict(avg)}
      </span>
      <ScoreRing value={avg} size="xs" />
    </div>
  );
}
