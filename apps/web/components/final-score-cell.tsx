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

/** Ring slot (2rem) + gap (0.375rem) + verdict slot (4rem) — one width for every row. */
const SCORE_BOX = "w-[6.375rem]";
/** One row: ring left, verdict right, on the same line. `shrink-0` keeps the box at SCORE_BOX. */
const SCORE_ROW = "flex shrink-0 items-center gap-1.5";
/**
 * The verdict's slot. `w-16` fixes where it starts; `min-w-0` switches off flexbox's automatic
 * content-based minimum, so a longer word ("Moderate" vs "Good") cannot widen the slot, move the
 * ring, or shift the group's centre.
 */
const VERDICT_SLOT = "w-16 min-w-0 shrink-0 whitespace-nowrap text-left";

/**
 * Fixed rightmost column of the resume × engine tables: the weighted final score of every engine
 * that ran for the row (group weights in `lib/ats-engines/aggregate.ts`, renormalised over what
 * ran). Hover shows each engine's effective weight.
 *
 * Layout: one horizontal row — ring on the left, verdict on the right — inside a box of one fixed
 * width (`SCORE_BOX` = ring 2rem + gap 0.375rem + verdict 4rem), centred in the cell. The ring is
 * `shrink-0` and comes first, so its x is the box's left edge in every row; the verdict sits in a
 * fixed `w-16 min-w-0` slot, so its length cannot widen the box or move the ring. The placeholder
 * row uses the same box, so a row without scores keeps the column's width and centre. The cell
 * itself is padded symmetrically and `text-center` (`ats-score-matrix.tsx`), which is what centres
 * this group under the "Final score" header.
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
        <span className={`${SCORE_ROW} ${SCORE_BOX}`}>
          <ScoreRing value={final.score} size="xs" />
          <span className={`text-foreground ${VERDICT_SLOT} text-[12px] font-medium`}>
            {scoreVerdict(final.score)}
          </span>
        </span>
      </div>
    </Tooltip>
  );
}
