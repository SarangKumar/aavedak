import { ShellWidth } from "@/components/shell-width";
import { Skeleton } from "@/components/ui/skeleton";

/** Route-level placeholder while RSC / navigation loads. */
export function PageLoadingSkeleton({
  variant = "default",
}: {
  variant?: "default" | "form" | "profile" | "board";
}) {
  if (variant === "form") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="border-border/80 space-y-3 rounded-xl border p-4 sm:p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
    );
  }

  if (variant === "profile") {
    return (
      <ShellWidth className="space-y-5 py-8 sm:py-10">
        <div className="border-border/80 space-y-4 rounded-lg border p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <Skeleton className="size-14 rounded-full sm:size-16" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-7 w-48 max-w-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="border-border/80 space-y-3 rounded-lg border p-4 sm:p-5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-12 w-full" />
        </div>
      </ShellWidth>
    );
  }

  if (variant === "board") {
    return (
      <ShellWidth className="space-y-4 py-7 sm:py-9">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-border/70 space-y-2 rounded-lg border p-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </ShellWidth>
    );
  }

  return (
    <ShellWidth className="space-y-4 py-7 sm:py-9">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="border-border/80 space-y-3 rounded-lg border p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    </ShellWidth>
  );
}
