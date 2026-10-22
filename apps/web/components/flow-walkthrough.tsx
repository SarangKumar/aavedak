import { AboutFlowDiagram } from "@/components/about-flow-diagram";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FLOWS } from "@/lib/about-flows";

/**
 * How-it-works page: every flow Aavedak runs (daily job scraping, daily people discovery,
 * registration and first ranking, re-ranking, multi-engine ATS, Improve resume). Each tab has
 * an animated beam diagram in the flow's real shape (loops, fan-out / fan-in, branches) and a
 * step-by-step trace of what it reads, writes, skips and retries.
 */
export function FlowWalkthrough() {
  return (
    <section className="space-y-5" aria-labelledby="flows">
      <div className="space-y-1">
        <p className="text-primary/90 font-mono text-[11px] uppercase tracking-wide">Flows</p>
        <h2 id="flows" className="aavedak-display text-foreground scroll-mt-24 text-xl sm:text-2xl">
          Every flow, traced from the code
        </h2>
      </div>
      <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
        {FLOWS.length} flows, each traced from the code that runs it: what starts it, what it reads
        and writes, and what happens when something is skipped or fails. The beams animate in the
        direction the data moves — dashed ones loop back to the start, muted ones are skips or
        stops. They hold still if your system asks for reduced motion.
      </p>

      <Tabs defaultValue={FLOWS[0]!.id} className="space-y-6">
        <TabsList aria-label="Flows" className="h-auto max-w-full flex-wrap justify-start">
          {FLOWS.map((flow) => (
            <TabsTrigger key={flow.id} value={flow.id} className="text-[12px]">
              {flow.tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {FLOWS.map((flow) => (
          <TabsContent key={flow.id} value={flow.id} className="space-y-6" data-flow={flow.id}>
            <div className="max-w-3xl space-y-2 text-[13px] leading-relaxed">
              <h3 className="text-foreground text-[14px] font-semibold tracking-tight">
                {flow.title}
              </h3>
              <p className="text-foreground/90">{flow.shape}</p>
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">Starts: </span>
                {flow.trigger}
              </p>
            </div>

            <div className="py-2 lg:py-4">
              <AboutFlowDiagram flowId={flow.id} />
            </div>

            <ol className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
              {flow.steps.map((step) => (
                <li key={step.title} className="space-y-1.5 text-[13px] leading-relaxed">
                  <h4 className="text-foreground font-semibold tracking-tight">{step.title}</h4>
                  <p className="text-foreground/90">{step.body}</p>
                  {step.data ? (
                    <p className="text-muted-foreground text-[12px]">
                      <span className="text-foreground/80 font-medium">Data: </span>
                      {step.data}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
