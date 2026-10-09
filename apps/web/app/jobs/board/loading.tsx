import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Full-screen board skeleton (covers the site header like the board itself). */
export default function JobsBoardLoading() {
  return (
    <div className="bg-background fixed inset-0 z-[60] flex flex-col gap-3 p-3 sm:p-4">
      <Card size="sm" className="flex-row items-center gap-2 p-2">
        <Skeleton className="h-8 w-full max-w-md rounded-md" />
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="ml-auto size-8 rounded-md" />
      </Card>
      <div className="flex min-h-0 flex-1 gap-4">
        <Card className="w-[360px] shrink-0 gap-2 p-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </Card>
        <Card className="bg-muted/20 min-w-0 flex-1 gap-4 p-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </Card>
      </div>
    </div>
  );
}
