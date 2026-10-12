import { ScoreRing } from "@/components/ui/score-ring";
import { Tooltip } from "@/components/ui/tooltip";
import { getEngine } from "@/lib/ats-engines/registry";
import {
  ATS_GROUP_WEIGHTS,
  weightedFinalScore,
  type FinalScoreEntry,
} from "@/lib/ats-engines/aggregate";
import { scoreVerdict } from "@/lib/ats-types";

const GROUP_LABEL = {
  native: "Native",
  reference: "Reference",
  open_source: "Open Source",
} as const;

/**
 * Fixed rightmost column of the resume × engine tables: the weighted final score of every engine
 * that ran for the row (native 50% · reference 35% · open source 15%, renormalised over what ran;
 * weights in `lib/ats-engines/aggregate.ts`). Hover shows each engine's effective weight.
 *
 * Layout: the placeholder and the score group are both centred in the column. The group is
 * [ring][verdict] with the verdict in a fixed-width box, so every ring sits on the same
 * vertical line regardless of verdict length.
 */
export function FinalScoreCell({ entries }: { entries: FinalScoreEntry[] }) {
  const final = weightedFinalScore(entries);
  if (final === null) {
    return (
      <div className="flex w-full items-center justify-center">
        <span className="text-muted-foreground text-[11px]">—</span>
      </div>
    );
  }
  const breakdown = (
    <span className="block max-w-72 space-y-1 text-[11px]">
      <span className="block font-medium">
        Weighted final score · Native {ATS_GROUP_WEIGHTS.native * 100}% · Reference{" "}
        {ATS_GROUP_WEIGHTS.reference * 100}% · Open Source {ATS_GROUP_WEIGHTS.open_source * 100}%
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
        className="flex w-full cursor-help items-center justify-center gap-1.5"
        tabIndex={0}
        aria-label={`Weighted final score ${final.score}`}
      >
        <ScoreRing value={final.score} size="xs" />
        <span className="text-foreground w-16 whitespace-nowrap text-left text-[12px] font-medium">
          {scoreVerdict(final.score)}
        </span>
      </div>
    </Tooltip>
  );
}
