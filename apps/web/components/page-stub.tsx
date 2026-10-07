import { cn } from "@/lib/utils";

type PageStubProps = {
  title: string;
  description: string;
  hint?: string;
  className?: string;
};

export function PageStub({ title, description, hint, className }: PageStubProps) {
  return (
    <div className={cn("relative mx-auto w-full max-w-3xl px-4 py-10 sm:px-6", className)}>
      <div className="space-y-2">
        <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">{title}</h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
          {description}
        </p>
      </div>
      <div className="border-border/80 bg-card/70 ring-primary/10 relative mt-8 overflow-hidden rounded-2xl border p-8 shadow-sm ring-1 backdrop-blur-sm">
        <div
          className="pointer-events-none absolute -top-16 right-0 size-40 rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--glow)" }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="bg-primary/15 ring-primary/25 flex size-12 items-center justify-center rounded-2xl ring-1">
            <span className="bg-primary size-2 rounded-full shadow-[0_0_10px_var(--glow)]" />
          </div>
          <p className="text-foreground text-sm font-semibold tracking-tight">Coming soon</p>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            {hint ??
              "This section is scaffolded. Features will land here without changing the route."}
          </p>
        </div>
      </div>
    </div>
  );
}
