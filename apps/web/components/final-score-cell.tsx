import { ScoreRing } from "@/components/ui/score-ring";
import { averageScore, scoreVerdict } from "@/lib/ats-types";

/**
 * Fixed rightmost column of the resume × engine tables: the mean of every score that ran
 * for the row. Display only, so it never opens a detail view.
 *
 * Layout: the placeholder and the score group are both centred in the column. The group is
 * [ring][verdict] with the verdict in a fixed-width box, so every ring sits on the same
 * vertical line regardless of verdict length.
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
      className="flex w-full items-center justify-center gap-1.5"
      title={`Average of ${scores.length} score${scores.length === 1 ? "" : "s"}`}
    >
      <ScoreRing value={avg} size="xs" />
      <span className="text-foreground w-16 whitespace-nowrap text-left text-[12px] font-medium">
        {scoreVerdict(avg)}
      </span>
    </div>
  );
}
