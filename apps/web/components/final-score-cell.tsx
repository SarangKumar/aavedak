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

/** Ring (2rem) + gap (0.375rem) + verdict slot (4rem) — one width for every row, score or not. */
const SCORE_BOX = "w-[6.375rem]";

/**
 * Fixed rightmost column of the resume × engine tables: the weighted final score of every engine
 * that ran for the row (group weights in `lib/ats-engines/aggregate.ts`, renormalised over what
 * ran). Hover shows each engine's effective weight.
 *
 * Layout: the content is centred in the cell, but the rings still line up row to row. Both the
 * placeholder and the [ring][verdict] group sit in the same fixed-width box (`SCORE_BOX`), with the
 * ring left-aligned inside it and the verdict in a fixed-width slot of its own — so a long verdict
 * ("Needs work") cannot push the ring off the line a short one ("Strong") sits on.
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
        <span className={`flex ${SCORE_BOX} items-center gap-1.5`}>
          <ScoreRing value={final.score} size="xs" />
          <span className="text-foreground w-16 whitespace-nowrap text-left text-[12px] font-medium">
            {scoreVerdict(final.score)}
          </span>
        </span>
      </div>
    </Tooltip>
  );
}
