"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** `replies`: system credit, +1 per user this person replied to (not a user vote). */
export type VoteSummaryDto = { up: number; down: number; mine: -1 | 0 | 1; replies: number };

/**
 * One up/down vote per user per person (clicking the active arrow clears it). Shown as a
 * community reliability signal — explicitly not a promise that the person will refer.
 */
export function PersonVote({
  personId,
  initial,
  className,
}: {
  personId: string;
  initial: VoteSummaryDto;
  className?: string;
}) {
  const [votes, setVotes] = useState(initial);
  const score = votes.up - votes.down + votes.replies;
  const replyNote =
    votes.replies > 0
      ? ` Includes +${votes.replies} from Aavedak: replied to ${votes.replies} user${
          votes.replies === 1 ? "" : "s"
        }.`
      : "";
  const [pending, setPending] = useState(false);

  async function cast(next: -1 | 1) {
    const vote = votes.mine === next ? 0 : next;
    setPending(true);
    try {
      const res = await fetch(`/api/people/${personId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      const data = (await res.json()) as { votes?: VoteSummaryDto; error?: string };
      if (!res.ok || !data.votes) throw new Error(data.error || "Vote failed.");
      setVotes(data.votes);
    } catch (err) {
      toast.add({
        title: "Could not save vote",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      title={`Community signal from Aavedak users — not proof they will refer.${replyNote}`}
    >
      <Button
        size="icon-xs"
        variant={votes.mine === 1 ? "secondary" : "ghost"}
        disabled={pending}
        aria-pressed={votes.mine === 1}
        aria-label="Helpful contact"
        onClick={() => void cast(1)}
      >
        ▲
      </Button>
      <span className="text-foreground min-w-[2ch] text-center text-[11px] font-medium tabular-nums">
        {score}
      </span>
      <Button
        size="icon-xs"
        variant={votes.mine === -1 ? "secondary" : "ghost"}
        disabled={pending}
        aria-pressed={votes.mine === -1}
        aria-label="Not helpful"
        onClick={() => void cast(-1)}
      >
        ▼
      </Button>
    </div>
  );
}

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
