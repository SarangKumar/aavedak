import { AboutFlowDiagram } from "@/components/about-flow-diagram";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FLOWS } from "@/lib/about-flows";

/**
 * About page: how Aavedak works, as separate flows (daily scraping, daily people discovery,
 * registration, re-ranking, multi-engine ATS, Improve resume). Each tab has a beam diagram in
 * the flow's real shape (loops, fan-out / fan-in, branches) and a step-by-step trace.
 */
export function AboutHowItWorks() {
  return (
    <section className="space-y-5" aria-labelledby="how-heading">
      <div className="max-w-2xl space-y-1">
        <h2 id="how-heading" className="text-foreground text-[15px] font-semibold tracking-tight">
          How Aavedak works
        </h2>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Six flows, each traced from the code: what starts it, what it reads and writes, and what
          happens when something is skipped or fails. Dashed beams loop back; muted ones are skips
          or stops.
        </p>
      </div>

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
