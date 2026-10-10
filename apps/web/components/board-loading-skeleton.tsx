import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Full-screen loading state for the `/…/board` routes (covers the site header like the board). */
export function BoardLoadingSkeleton({ columns = 2 }: { columns?: 2 | 3 }) {
  return (
    <div className="bg-background fixed inset-0 z-[60] flex flex-col gap-2 p-3 sm:p-4">
      <Card size="sm" className="flex-row items-center gap-2 p-2">
        <Skeleton className="h-8 w-full max-w-md rounded-md" />
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="ml-auto size-8 rounded-md" />
      </Card>
      {columns === 3 ? (
        <div className="flex min-h-0 flex-1 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            // 1fr 2fr 1fr, like the Referrals columns
            <Card key={i} className="min-w-0 gap-2 p-3" style={{ flex: `${i === 1 ? 2 : 1} 1 0%` }}>
              <Skeleton className="h-6 w-32" />
              {Array.from({ length: 6 }).map((__, j) => (
                <Skeleton key={j} className="h-12 w-full rounded-md" />
              ))}
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2">
          <Card className="w-[340px] shrink-0 gap-2 p-3">
            <Skeleton className="h-9 w-full rounded-lg" />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </Card>
          <Card className="bg-muted/20 min-w-0 flex-1 gap-4 p-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </Card>
        </div>
      )}
    </div>
  );
}
