"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type GraphPerson = {
  userId: string;
  name: string;
  username?: string;
  since?: string;
};

type FriendGraphProps = {
  me: GraphPerson;
  friends: GraphPerson[];
  loading?: boolean;
  durationLabel: string;
  className?: string;
};

const WIDTH = 640;
const HEIGHT = 420;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

function layoutFriends(count: number) {
  const radius = Math.min(WIDTH, HEIGHT) * 0.32;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(count, 1)) * Math.PI * 2;
    return {
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius,
    };
  });
}

function daysSince(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function FriendGraph({
  me,
  friends,
  loading = false,
  durationLabel,
  className,
}: FriendGraphProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const positions = useMemo(
    () => layoutFriends(Math.max(friends.length, loading ? 6 : 0)),
    [friends.length, loading],
  );
  const hovered = friends.find((friend) => friend.userId === hoveredId) ?? null;

  return (
    <div
      className={cn(
        "border-border/80 bg-card relative overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="text-foreground block h-auto w-full"
        role="img"
        aria-label="Friend graph"
      >
        <rect width={WIDTH} height={HEIGHT} className="fill-background/40" />
        {(loading ? positions : friends.map((_, i) => positions[i]!)).map((pos, index) => (
          <line
            key={`edge-${index}`}
            x1={CX}
            y1={CY}
            x2={pos.x}
            y2={pos.y}
            className="stroke-border"
            strokeWidth={1.5}
            strokeDasharray={loading ? "4 4" : undefined}
          />
        ))}

        {loading
          ? positions.map((pos, index) => (
              <g key={`sk-${index}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={18}
                  className="fill-muted stroke-border"
                  strokeWidth={1}
                />
              </g>
            ))
          : friends.map((friend, index) => {
              const pos = positions[index]!;
              const active = hoveredId === friend.userId;
              return (
                <g
                  key={friend.userId}
                  onMouseEnter={() => setHoveredId(friend.userId)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={active ? 20 : 18}
                    fill="color-mix(in oklch, oklch(0.72 0.12 200) 55%, transparent)"
                    stroke="oklch(0.72 0.12 200)"
                    strokeWidth={2}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 32}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {(friend.name || friend.username || "Friend").slice(0, 14)}
                  </text>
                </g>
              );
            })}

        <circle cx={CX} cy={CY} r={26} className="fill-primary stroke-primary" strokeWidth={2} />
        <text
          x={CX}
          y={CY + 4}
          textAnchor="middle"
          className="fill-primary-foreground text-[12px] font-semibold"
        >
          You
        </text>
        <text
          x={CX}
          y={CY + 44}
          textAnchor="middle"
          className="fill-foreground text-[12px] font-medium"
        >
          {(me.name || "You").slice(0, 18)}
        </text>
      </svg>

      <div className="border-border/70 bg-background/90 absolute left-3 top-3 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm">
        <p className="text-foreground font-medium">Legend</p>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
          <span className="bg-primary inline-block size-2.5 rounded-full" /> You (main)
        </p>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: "oklch(0.72 0.12 200)" }}
          />{" "}
          Friends
        </p>
        {hovered ? (
          <p className="text-foreground border-border/60 mt-1.5 border-t pt-1.5">
            {hovered.name}
            {hovered.username ? ` · /${hovered.username}` : ""}
            <span className="text-muted-foreground block">Together {daysSince(hovered.since)}</span>
          </p>
        ) : (
          <p className="text-muted-foreground mt-1.5">Hover a friend for details</p>
        )}
      </div>

      <div className="border-border/70 bg-background/90 text-muted-foreground absolute bottom-3 right-3 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm">
        Duration · {durationLabel}
      </div>
    </div>
  );
}
