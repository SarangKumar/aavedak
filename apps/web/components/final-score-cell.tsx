import { ScoreRing } from "@/components/ui/score-ring";
import { Tooltip } from "@/components/ui/tooltip";
import { getEngine } from "@/lib/ats-engines/registry";
import {
  ATS_GROUP_WEIGHTS,
  weightedFinalScore,
  type AtsEngineGroup,
  type FinalScoreEntry,
} from "@/lib/ats-engines/aggregate";
import { scoreVerdict } from "@/lib/ats-types";

const GROUP_LABEL: Record<AtsEngineGroup, string> = {
  native: "Native",
  reference: "Reference",
  platform: "ATS platform",
  open_source: "Open Source",
};

/** Ring track (2rem) + gap (0.375rem) + verdict track (4rem) — one width for every row. */
const SCORE_BOX = "w-[6.375rem]";
/** Fixed tracks: the ring can only ever start at track 1, the verdict at track 2. */
const SCORE_GRID = "grid grid-cols-[2rem_4rem] items-center gap-1.5";

/**
 * Fixed rightmost column of the resume × engine tables: the weighted final score of every engine
 * that ran for the row (group weights in `lib/ats-engines/aggregate.ts`, renormalised over what
 * ran). Hover shows each engine's effective weight.
 *
 * Layout: the group is centred in the cell, and every ring still sits on one vertical line. The
 * group is a two-track CSS grid of fixed widths — `[2rem ring][4rem verdict]` with a 0.375rem gap,
 * `SCORE_BOX` wide in total — so the verdict always starts at the same x and its length can neither
 * move the ring nor widen the group (fixed tracks have no content-based minimum, unlike a flex
 * item). The placeholder row uses the same box, so a row without scores keeps the column's width
 * and centre. The cell itself is padded symmetrically (`ats-score-matrix.tsx`), which is what
 * actually centres this group under the "Final score" header.
 */
export function FinalScoreCell({ entries }: { entries: FinalScoreEntry[] }) {
  const final = weightedFinalScore(entries);
  if (final === null) {
    return (
      <div className="flex w-full items-center justify-center">
        <span className={`text-muted-foreground ${SCORE_BOX} text-center text-[11px]`}>—</span>
      </div>
    );
  }
  const breakdown = (
    <span className="block max-w-72 space-y-1 text-[11px]">
      <span className="block font-medium">
        Weighted final score ·{" "}
        {(Object.keys(GROUP_LABEL) as AtsEngineGroup[])
          .map((g) => `${GROUP_LABEL[g]} ${ATS_GROUP_WEIGHTS[g] * 100}%`)
          .join(" · ")}{" "}
        (renormalised over engines that ran)
      </span>
      {[...final.parts]
        .sort((a, b) => b.weight - a.weight)
        .map((p) => (
          <span key={p.engineId} className="flex justify-between gap-3 tabular-nums">
            <span>
              {getEngine(p.engineId)?.name ?? p.engineId}{" "}
              <span className="opacity-70">({GROUP_LABEL[p.group]})</span>
            </span>
            <span>
              {p.score} × {(p.weight * 100).toFixed(1)}%
            </span>
          </span>
        ))}
    </span>
  );
  return (
    <Tooltip content={breakdown}>
      <div
        className="flex w-full cursor-help items-center justify-center"
        tabIndex={0}
        aria-label={`Weighted final score ${final.score}`}
      >
        <span className={`${SCORE_GRID} ${SCORE_BOX}`}>
          <ScoreRing value={final.score} size="xs" />
          <span className="text-foreground whitespace-nowrap text-left text-[12px] font-medium">
            {scoreVerdict(final.score)}
          </span>
        </span>
      </div>
    </Tooltip>
  );
}
