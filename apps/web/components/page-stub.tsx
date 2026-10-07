import { cn } from "@/lib/utils";

type PageStubProps = {
  title: string;
  description: string;
  hint?: string;
  className?: string;
};

export function PageStub({ title, description, hint, className }: PageStubProps) {
  return (
    <div className={cn("mx-auto w-full max-w-3xl px-4 py-10 sm:px-6", className)}>
      <div className="space-y-2">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
          {description}
        </p>
      </div>
      <div className="border-border bg-card ring-ring/5 mt-8 rounded-xl border p-8 shadow-sm ring-1">
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="bg-muted ring-border size-12 rounded-full ring-1" />
          <p className="text-foreground text-sm font-medium">Coming soon</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {hint ??
              "This section is scaffolded. Features will land here without changing the route."}
          </p>
        </div>
      </div>
    </div>
  );
}
