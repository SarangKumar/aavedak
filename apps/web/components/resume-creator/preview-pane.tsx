"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  RESUME_CREATOR_FONTS,
  type ResumeCreatorDraft,
} from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

function contactLine(draft: ResumeCreatorDraft): string {
  const c = draft.content.contact;
  return [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("  ·  ");
}

function SectionRule({ rule }: { rule: ResumeCreatorDraft["style"]["rule"] }) {
  if (rule === "none") return null;
  return (
    <div
      className={cn(
        "w-full border-t",
        rule === "light" ? "border-neutral-200" : "border-neutral-400",
      )}
      style={{ marginTop: "1pt", marginBottom: "4pt" }}
      aria-hidden
    />
  );
}

/**
 * Paper content at true A4 point sizes — identical numbers to the PDF exporter.
 * The outer preview scales this whole page; never change font units here to px.
 */
function PaperContent({ draft }: { draft: ResumeCreatorDraft }) {
  const style = draft.style;
  const font = RESUME_CREATOR_FONTS[style.fontFamily].css;
  const visible = (id: string) => draft.sections.some((s) => s.id === id && s.visible);
  const titleOf = (id: string) =>
    draft.sections.find((s) => s.id === id)?.title ?? id.toUpperCase();

  const skills = draft.content.skills
    .split(/[\n,•]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const textStyle = (pt: number, extra?: CSSProperties): CSSProperties => ({
    fontSize: `${pt}pt`,
    lineHeight: style.lineHeight,
    margin: 0,
    ...extra,
  });

  return (
    <div
      className="box-border h-full w-full bg-white text-black"
      style={{
        fontFamily: font,
        paddingLeft: `${style.marginXPt}pt`,
        paddingRight: `${style.marginXPt}pt`,
        paddingTop: `${style.marginYPt}pt`,
        paddingBottom: `${style.marginYPt}pt`,
      }}
    >
      {visible("contact") ? (
        <header>
          <p
            className="font-bold tracking-tight text-neutral-950"
            style={textStyle(style.headerPt)}
          >
            {draft.content.contact.fullName.trim() || "Your name"}
          </p>
          {contactLine(draft) ? (
            <p className="text-neutral-600" style={textStyle(style.footerPt, { marginTop: "2pt" })}>
              {contactLine(draft)}
            </p>
          ) : (
            <p className="text-neutral-400" style={textStyle(style.footerPt, { marginTop: "2pt" })}>
              Email · phone · location · links
            </p>
          )}
          {style.rule !== "none" ? (
            <div style={{ marginTop: `${style.sectionGapPt * 0.4}pt` }}>
              <SectionRule rule={style.rule} />
            </div>
          ) : (
            <div style={{ height: `${style.sectionGapPt * 0.4}pt` }} />
          )}
        </header>
      ) : null}

      {visible("summary") && draft.content.summary.trim() ? (
        <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
          <h2
            className="font-bold uppercase tracking-wide text-neutral-900"
            style={textStyle(style.sectionTitlePt)}
          >
            {titleOf("summary")}
          </h2>
          <SectionRule rule={style.rule} />
          <p
            className="whitespace-pre-wrap text-neutral-800"
            style={textStyle(style.bodyPt, { marginTop: "1pt" })}
          >
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
              <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={textStyle(style.sectionTitlePt)}
                >
                  {titleOf("experience")}
                </h2>
                <SectionRule rule={style.rule} />
                <div style={{ marginTop: "1pt" }}>
                  {entries.map((e, ei) => (
                    <div
                      key={e.id}
                      style={{ marginTop: ei === 0 ? 0 : "6pt", marginBottom: "3pt" }}
                    >
                      <p className="font-semibold text-neutral-900" style={textStyle(style.bodyPt)}>
                        {[e.title.trim(), e.company.trim()].filter(Boolean).join(" — ")}
                        {[e.start, e.end].some((s) => s.trim()) ? (
                          <span className="float-right font-normal text-neutral-600">
                            {[e.start.trim(), e.end.trim()].filter(Boolean).join(" – ")}
                          </span>
                        ) : null}
                      </p>
                      {e.location.trim() ? (
                        <p className="text-neutral-500" style={textStyle(style.footerPt)}>
                          {e.location.trim()}
                        </p>
                      ) : null}
                      <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                        {e.bullets
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li
                              key={`${e.id}-b-${i}`}
                              className="text-neutral-800"
                              style={{
                                ...textStyle(style.bodyPt),
                                paddingLeft: "8pt",
                                textIndent: "-8pt",
                              }}
                            >
                              • {b.trim()}
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
              <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={textStyle(style.sectionTitlePt)}
                >
                  {titleOf("education")}
                </h2>
                <SectionRule rule={style.rule} />
                <div style={{ marginTop: "1pt" }}>
                  {entries.map((e, ei) => (
                    <div key={e.id} style={{ marginTop: ei === 0 ? 0 : "4pt" }}>
                      <p className="font-semibold text-neutral-900" style={textStyle(style.bodyPt)}>
                        {[e.degree.trim(), e.school.trim()].filter(Boolean).join(" — ")}
                        {[e.start, e.end].some((s) => s.trim()) ? (
                          <span className="float-right font-normal text-neutral-600">
                            {[e.start.trim(), e.end.trim()].filter(Boolean).join(" – ")}
                          </span>
                        ) : null}
                      </p>
                      {[e.location, e.details].some((s) => s.trim()) ? (
                        <p className="text-neutral-500" style={textStyle(style.footerPt)}>
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

      {visible("skills") && skills.length ? (
        <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
          <h2
            className="font-bold uppercase tracking-wide text-neutral-900"
            style={textStyle(style.sectionTitlePt)}
          >
            {titleOf("skills")}
          </h2>
          <SectionRule rule={style.rule} />
          <p className="text-neutral-800" style={textStyle(style.bodyPt, { marginTop: "1pt" })}>
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
              <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={textStyle(style.sectionTitlePt)}
                >
                  {titleOf("projects")}
                </h2>
                <SectionRule rule={style.rule} />
                <div style={{ marginTop: "1pt" }}>
                  {entries.map((p, pi) => (
                    <div
                      key={p.id}
                      style={{ marginTop: pi === 0 ? 0 : "4pt", marginBottom: "2pt" }}
                    >
                      <p className="font-semibold text-neutral-900" style={textStyle(style.bodyPt)}>
                        {[p.name.trim(), p.link.trim()].filter(Boolean).join(" — ")}
                      </p>
                      {p.description.trim() ? (
                        <p className="text-neutral-800" style={textStyle(style.bodyPt)}>
                          {p.description.trim()}
                        </p>
                      ) : null}
                      <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                        {p.bullets
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li
                              key={`${p.id}-b-${i}`}
                              className="text-neutral-800"
                              style={{
                                ...textStyle(style.bodyPt),
                                paddingLeft: "8pt",
                                textIndent: "-8pt",
                              }}
                            >
                              • {b.trim()}
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
              <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
                <h2
                  className="font-bold uppercase tracking-wide text-neutral-900"
                  style={textStyle(style.sectionTitlePt)}
                >
                  {titleOf("certifications")}
                </h2>
                <SectionRule rule={style.rule} />
                <ul className="list-none" style={{ marginTop: "1pt", padding: 0 }}>
                  {entries.map((c) => (
                    <li key={c.id} className="text-neutral-800" style={textStyle(style.bodyPt)}>
                      {[c.name.trim(), c.issuer.trim(), c.year.trim()].filter(Boolean).join(" — ")}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()
        : null}
    </div>
  );
}

/** Live A4 preview: true-pt paper, CSS-scaled to the pane (same metrics as the PDF). */
export function ResumeCreatorPreview({
  draft,
  className,
}: {
  draft: ResumeCreatorDraft;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      // CSS `pt` is 1/72in; at the CSS reference 96dpi, 1pt = 96/72 px.
      const pxPerPt = 96 / 72;
      const paperCssPx = A4_WIDTH_PT * pxPerPt;
      setScale(Math.min(1, w / paperCssPx));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pxPerPt = 96 / 72;
  const paperWpx = A4_WIDTH_PT * pxPerPt;
  const paperHpx = A4_HEIGHT_PT * pxPerPt;

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 shrink-0 px-1">
        <p className="aavedak-section-title text-foreground">Live A4 preview</p>
        <p className="aavedak-meta text-muted-foreground mt-0.5">
          True A4 · {draft.style.bodyPt}pt body · margins {draft.style.marginXPt}/
          {draft.style.marginYPt}pt · same numbers as the downloaded PDF
          {scale < 0.999 ? ` · scaled ${(scale * 100).toFixed(0)}%` : ""}
        </p>
      </div>
      <ScrollArea className="relative min-h-0 flex-1 rounded-md bg-[#e8e8e8] p-3 sm:p-4 dark:bg-[#2a2a2a]">
        <div ref={frameRef} className="mx-auto w-full">
          <div
            className="relative mx-auto"
            style={{
              width: paperWpx * scale,
              height: paperHpx * scale,
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[2px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
              style={{
                width: paperWpx,
                height: paperHpx,
                transform: `scale(${scale})`,
              }}
            >
              <PaperContent draft={draft} />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
