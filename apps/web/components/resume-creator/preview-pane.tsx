"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { RESUME_CREATOR_FONTS, type ResumeCreatorDraft } from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

function contactLine(draft: ResumeCreatorDraft): string {
  const c = draft.content.contact;
  return [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("  ·  ");
}

function SectionRule({ modern }: { modern?: boolean }) {
  return (
    <div
      className={cn("my-1 w-full border-t", modern ? "border-neutral-200" : "border-neutral-400")}
      aria-hidden
    />
  );
}

/** Live A4 HTML preview that mirrors the PDF layout proportions. */
export function ResumeCreatorPreview({
  draft,
  className,
}: {
  draft: ResumeCreatorDraft;
  className?: string;
}) {
  const font = RESUME_CREATOR_FONTS[draft.typography.fontFamily].css;
  const { headerPt, sectionTitlePt, bodyPt, footerPt } = draft.typography;
  const modern = draft.templateId === "modern";
  const executive = draft.templateId === "executive";

  const visible = (id: string) => draft.sections.some((s) => s.id === id && s.visible);
  const titleOf = (id: string) =>
    draft.sections.find((s) => s.id === id)?.title ?? id.toUpperCase();

  const skills = draft.content.skills
    .split(/[\n,•]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const mainSections = (
    <>
      {visible("summary") && draft.content.summary.trim() ? (
        <section className="mt-2">
          <h2
            className="font-bold uppercase tracking-wide text-neutral-900"
            style={{ fontSize: sectionTitlePt }}
          >
            {titleOf("summary")}
          </h2>
          <SectionRule modern={modern} />
          <p className="mt-1 whitespace-pre-wrap text-neutral-800" style={{ fontSize: bodyPt }}>
            {draft.content.summary.trim()}
          </p>
        </section>
      ) : null}

      {visible("experience")
        ? (() => {
            const entries = draft.content.experience.filter(
              (e) => e.company.trim() || e.title.trim() || e.bullets.some((b) => b.trim()),
            );
            if (!entries.length) return null;
            return (
              <section className="mt-2.5">
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={{ fontSize: sectionTitlePt }}
                >
                  {titleOf("experience")}
                </h2>
                <SectionRule modern={modern} />
                <div className="mt-1 space-y-2">
                  {entries.map((e) => (
                    <div key={e.id}>
                      <p className="font-semibold text-neutral-900" style={{ fontSize: bodyPt }}>
                        {[e.title.trim(), e.company.trim()].filter(Boolean).join(" — ")}
                        {[e.start, e.end].some((s) => s.trim()) ? (
                          <span className="float-right font-normal text-neutral-600">
                            {[e.start.trim(), e.end.trim()].filter(Boolean).join(" – ")}
                          </span>
                        ) : null}
                      </p>
                      {e.location.trim() ? (
                        <p className="text-neutral-500" style={{ fontSize: footerPt }}>
                          {e.location.trim()}
                        </p>
                      ) : null}
                      <ul className="mt-0.5 list-none space-y-0.5">
                        {e.bullets
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li
                              key={`${e.id}-b-${i}`}
                              className="pl-3 text-neutral-800"
                              style={{ fontSize: bodyPt, textIndent: "-0.65rem" }}
                            >
                              <span className="mr-1">•</span>
                              {b.trim()}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()
        : null}

      {visible("education")
        ? (() => {
            const entries = draft.content.education.filter(
              (e) => e.school.trim() || e.degree.trim(),
            );
            if (!entries.length) return null;
            return (
              <section className="mt-2.5">
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={{ fontSize: sectionTitlePt }}
                >
                  {titleOf("education")}
                </h2>
                <SectionRule modern={modern} />
                <div className="mt-1 space-y-1.5">
                  {entries.map((e) => (
                    <div key={e.id}>
                      <p className="font-semibold text-neutral-900" style={{ fontSize: bodyPt }}>
                        {[e.degree.trim(), e.school.trim()].filter(Boolean).join(" — ")}
                        {[e.start, e.end].some((s) => s.trim()) ? (
                          <span className="float-right font-normal text-neutral-600">
                            {[e.start.trim(), e.end.trim()].filter(Boolean).join(" – ")}
                          </span>
                        ) : null}
                      </p>
                      {[e.location, e.details].some((s) => s.trim()) ? (
                        <p className="text-neutral-500" style={{ fontSize: footerPt }}>
                          {[e.location.trim(), e.details.trim()].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            );
          })()
        : null}

      {visible("skills") && skills.length && !executive ? (
        <section className="mt-2.5">
          <h2
            className="font-bold uppercase tracking-wide text-neutral-900"
            style={{ fontSize: sectionTitlePt }}
          >
            {titleOf("skills")}
          </h2>
          <SectionRule modern={modern} />
          <p className="mt-1 text-neutral-800" style={{ fontSize: bodyPt }}>
            {skills.join(" · ")}
          </p>
        </section>
      ) : null}

      {visible("projects")
        ? (() => {
            const entries = draft.content.projects.filter(
              (p) => p.name.trim() || p.description.trim() || p.bullets.some((b) => b.trim()),
            );
            if (!entries.length) return null;
            return (
              <section className="mt-2.5">
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={{ fontSize: sectionTitlePt }}
                >
                  {titleOf("projects")}
                </h2>
                <SectionRule modern={modern} />
                <div className="mt-1 space-y-2">
                  {entries.map((p) => (
                    <div key={p.id}>
                      <p className="font-semibold text-neutral-900" style={{ fontSize: bodyPt }}>
                        {[p.name.trim(), p.link.trim()].filter(Boolean).join(" — ")}
                      </p>
                      {p.description.trim() ? (
                        <p className="text-neutral-800" style={{ fontSize: bodyPt }}>
                          {p.description.trim()}
                        </p>
                      ) : null}
                      <ul className="mt-0.5 list-none space-y-0.5">
                        {p.bullets
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li
                              key={`${p.id}-b-${i}`}
                              className="pl-3 text-neutral-800"
                              style={{ fontSize: bodyPt, textIndent: "-0.65rem" }}
                            >
                              <span className="mr-1">•</span>
                              {b.trim()}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()
        : null}

      {visible("certifications")
        ? (() => {
            const entries = draft.content.certifications.filter((c) => c.name.trim());
            if (!entries.length) return null;
            return (
              <section className="mt-2.5">
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={{ fontSize: sectionTitlePt }}
                >
                  {titleOf("certifications")}
                </h2>
                <SectionRule modern={modern} />
                <ul className="mt-1 space-y-0.5">
                  {entries.map((c) => (
                    <li key={c.id} className="text-neutral-800" style={{ fontSize: bodyPt }}>
                      {[c.name.trim(), c.issuer.trim(), c.year.trim()].filter(Boolean).join(" — ")}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()
        : null}
    </>
  );

  const paper = (
    <div
      className="box-border h-full min-h-full w-full bg-white px-[8%] pb-[7%] pt-[7%] text-black"
      style={{ fontFamily: font, lineHeight: 1.35 }}
    >
      {visible("contact") ? (
        <header className={cn(modern || executive ? "pb-2" : "pb-1")}>
          <p
            className="font-bold tracking-tight text-neutral-950"
            style={{ fontSize: headerPt, lineHeight: 1.15 }}
          >
            {draft.content.contact.fullName.trim() || "Your name"}
          </p>
          {contactLine(draft) ? (
            <p className="mt-1 text-neutral-600" style={{ fontSize: footerPt }}>
              {contactLine(draft)}
            </p>
          ) : (
            <p className="mt-1 text-neutral-400" style={{ fontSize: footerPt }}>
              Email · phone · location · links
            </p>
          )}
          {modern || executive ? <SectionRule modern /> : null}
        </header>
      ) : null}

      {executive ? (
        <div className="mt-2 grid grid-cols-[30%_1fr] gap-4">
          <aside className="space-y-3 border-r border-neutral-200 pr-3">
            {visible("skills") && skills.length ? (
              <section>
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={{ fontSize: sectionTitlePt }}
                >
                  {titleOf("skills")}
                </h2>
                <SectionRule modern />
                <ul className="mt-1 space-y-0.5">
                  {skills.map((s) => (
                    <li key={s} className="text-neutral-800" style={{ fontSize: bodyPt }}>
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {visible("contact") ? (
              <section>
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={{ fontSize: sectionTitlePt }}
                >
                  Links
                </h2>
                <SectionRule modern />
                <ul className="mt-1 space-y-0.5 break-all">
                  {[
                    draft.content.contact.linkedin,
                    draft.content.contact.github,
                    draft.content.contact.portfolio,
                  ]
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((s) => (
                      <li key={s} className="text-neutral-700" style={{ fontSize: footerPt }}>
                        {s}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}
          </aside>
          <div>{mainSections}</div>
        </div>
      ) : (
        mainSections
      )}
    </div>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 shrink-0 px-1">
        <p className="aavedak-section-title text-foreground">Live A4 preview</p>
        <p className="aavedak-meta text-muted-foreground mt-0.5">
          210 × 297 mm · {RESUME_CREATOR_FONTS[draft.typography.fontFamily].label} · updates as you
          type
        </p>
      </div>
      <ScrollArea className="relative min-h-0 flex-1 rounded-md bg-[#e8e8e8] p-3 sm:p-4 dark:bg-[#2a2a2a]">
        <div className="relative mx-auto w-full max-w-[34rem]" style={{ aspectRatio: "210 / 297" }}>
          <div className="absolute inset-0 overflow-hidden rounded-[2px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/5">
            {paper}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
