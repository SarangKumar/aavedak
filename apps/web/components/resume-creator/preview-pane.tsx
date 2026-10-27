"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RESUME_CREATOR_FONTS,
  RESUME_FONT_WEIGHTS,
  pageSizePt,
  type ResumeCreatorDraft,
  type ResumeCreatorStyle,
  type ResumeFontWeight,
} from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

type ContactDisplay = { label: string; href: string | null };

function ensureUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || /^mailto:/i.test(v) || /^tel:/i.test(v)) return v;
  if (v.includes("@") && !v.includes(" ")) return `mailto:${v}`;
  if (/^[+\d][\d\s().-]{6,}$/.test(v)) return `tel:${v.replace(/[\s().-]/g, "")}`;
  return `https://${v.replace(/^\/+/, "")}`;
}

function contactLinks(draft: ResumeCreatorDraft): ContactDisplay[] {
  const c = draft.content.contact;
  const out: ContactDisplay[] = [];
  const pushLink = (link: { label: string; value: string }, kind: "email" | "phone" | "url") => {
    const value = link.value.trim();
    if (!value) return;
    const label = link.label.trim() || value;
    let href = value;
    if (kind === "email") href = value.startsWith("mailto:") ? value : `mailto:${value}`;
    else if (kind === "phone") {
      const digits = value.replace(/[^\d+]/g, "");
      href = value.startsWith("tel:") ? value : `tel:${digits}`;
    } else href = ensureUrl(value);
    out.push({ label, href });
  };
  pushLink(c.email, "email");
  pushLink(c.phone, "phone");
  if (c.location.trim()) out.push({ label: c.location.trim(), href: null });
  pushLink(c.linkedin, "url");
  pushLink(c.github, "url");
  pushLink(c.portfolio, "url");
  return out;
}

/** Best-effort format for free-text dates already on the draft. */
function formatDateToken(raw: string, format: ResumeCreatorStyle["dateFormat"]): string {
  const s = raw.trim();
  if (!s) return "";
  if (/present|current|now/i.test(s)) return s;
  const m = s.match(/^(\d{4})[-/.](\d{1,2})$/) || s.match(/^(\d{1,2})[-/.](\d{4})$/);
  let year = "";
  let month = 0;
  if (m) {
    if (m[1].length === 4) {
      year = m[1];
      month = Number(m[2]);
    } else {
      month = Number(m[1]);
      year = m[2];
    }
  } else {
    const yOnly = s.match(/^(19|20)\d{2}$/);
    if (yOnly) return s;
    const named = s.match(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\s-]+(\d{4})$/i,
    );
    if (named) {
      const map: Record<string, number> = {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12,
      };
      month = map[named[1].slice(0, 3).toLowerCase()] ?? 0;
      year = named[2];
    } else {
      return s;
    }
  }
  if (!year || month < 1 || month > 12) return s;
  const short = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const long = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (format === "numeric") return `${String(month).padStart(2, "0")}.${year}`;
  if (format === "long") return `${long[month - 1]} ${year}`;
  return `${short[month - 1]} ${year}`;
}

function formatRange(start: string, end: string, format: ResumeCreatorStyle["dateFormat"]): string {
  const a = formatDateToken(start, format);
  const b = formatDateToken(end, format);
  return [a, b].filter(Boolean).join(" – ");
}

type SkillRow =
  { kind: "plain"; items: string[] } | { kind: "category"; category: string; items: string[] };

function parseSkills(raw: string): SkillRow[] {
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const categorized = lines.some((l) => /^[^:]{1,40}:\s*.+/.test(l));
  if (!categorized) {
    const items = raw
      .split(/[\n,•]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length ? [{ kind: "plain", items }] : [];
  }
  const rows: SkillRow[] = [];
  for (const line of lines) {
    const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (m) {
      const items = m[2]
        .split(/[,•]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      rows.push({ kind: "category", category: m[1].trim(), items });
    } else {
      const items = line
        .split(/[,•]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length) rows.push({ kind: "plain", items });
    }
  }
  return rows;
}

function SectionRule({
  rule,
  titleContentGapPt,
}: {
  rule: ResumeCreatorDraft["style"]["rule"];
  titleContentGapPt: number;
}) {
  if (rule === "none") return null;
  return (
    <div
      className={cn(
        "w-full border-t",
        rule === "light" ? "border-neutral-200" : "border-neutral-400",
      )}
      style={{ marginTop: "1pt", marginBottom: `${titleContentGapPt}pt` }}
      aria-hidden
    />
  );
}

function PaperContent({ draft }: { draft: ResumeCreatorDraft }) {
  const style = draft.style;
  const primaryCss = RESUME_CREATOR_FONTS[style.primaryFont].css;
  const secondaryCss = RESUME_CREATOR_FONTS[style.secondaryFont].css;
  const visible = (id: string) => draft.sections.some((s) => s.id === id && s.visible);
  const titleOf = (id: string) =>
    draft.sections.find((s) => s.id === id)?.title ?? id.toUpperCase();

  const skillRows = parseSkills(draft.content.skills);

  const textStyle = (
    pt: number,
    opts?: {
      face?: "primary" | "secondary";
      weight?: ResumeFontWeight;
      extra?: CSSProperties;
    },
  ): CSSProperties => ({
    fontSize: `${pt}pt`,
    lineHeight: style.lineHeight,
    margin: 0,
    fontFamily: opts?.face === "primary" ? primaryCss : secondaryCss,
    fontWeight: RESUME_FONT_WEIGHTS[opts?.weight ?? "regular"].css,
    ...opts?.extra,
  });

  const headerAlign =
    style.headerAlign === "center" ? "center" : style.headerAlign === "right" ? "right" : "left";

  const sectionTitle = (id: string) => (
    <>
      <h2
        className="uppercase tracking-wide text-neutral-900"
        style={textStyle(style.sectionTitlePt, {
          face: "primary",
          weight: style.sectionTitleWeight,
        })}
      >
        {titleOf(id)}
      </h2>
      <SectionRule rule={style.rule} titleContentGapPt={style.titleContentGapPt} />
    </>
  );

  const dateSpan = (start: string, end: string) => {
    const text = formatRange(start, end, style.dateFormat);
    if (!text) return null;
    return (
      <span
        className={cn(
          "font-normal text-neutral-600",
          style.dateAlign === "right" ? "float-right" : "float-left mr-2",
        )}
      >
        {text}
      </span>
    );
  };

  const locationLine = (text: string) => {
    if (!text.trim()) return null;
    return (
      <p
        className={cn(
          "text-neutral-500",
          style.locationAlign === "right" ? "text-right" : "text-left",
        )}
        style={textStyle(style.footerPt, {
          face: "secondary",
          weight: style.secondaryHeadingWeight,
        })}
      >
        {text.trim()}
      </p>
    );
  };

  const padTop = style.marginYPt + style.headerFooterPt;
  const padBottom = style.marginYPt + style.headerFooterPt;

  return (
    <div
      className="box-border h-full w-full bg-white text-black"
      style={{
        fontFamily: secondaryCss,
        paddingLeft: `${style.marginXPt}pt`,
        paddingRight: `${style.marginXPt}pt`,
        paddingTop: `${padTop}pt`,
        paddingBottom: `${padBottom}pt`,
      }}
    >
      {visible("contact") ? (
        <header style={{ textAlign: headerAlign }}>
          <p
            className="tracking-tight text-neutral-950"
            style={textStyle(style.headerPt, {
              face: "primary",
              weight: style.headerWeight,
            })}
          >
            {draft.content.contact.fullName.trim() || "Your name"}
          </p>
          {contactLinks(draft).length ? (
            <p
              className="text-neutral-600"
              style={textStyle(style.footerPt, {
                face: "secondary",
                weight: style.secondaryHeadingWeight,
                extra: { marginTop: "2pt" },
              })}
            >
              {contactLinks(draft).map((item, i) => (
                <span key={`${item.label}-${i}`}>
                  {i > 0 ? <span aria-hidden>{"  ·  "}</span> : null}
                  {item.href ? (
                    <a
                      href={item.href}
                      className="text-neutral-600 underline-offset-2 hover:underline"
                      style={{ color: "inherit" }}
                    >
                      {item.label}
                    </a>
                  ) : (
                    item.label
                  )}
                </span>
              ))}
            </p>
          ) : (
            <p
              className="text-neutral-400"
              style={textStyle(style.footerPt, {
                face: "secondary",
                weight: "regular",
                extra: { marginTop: "2pt" },
              })}
            >
              Email · phone · location · links
            </p>
          )}
          {style.rule !== "none" ? (
            <div style={{ marginTop: `${style.sectionGapPt * 0.4}pt` }}>
              <SectionRule rule={style.rule} titleContentGapPt={0} />
            </div>
          ) : (
            <div style={{ height: `${style.sectionGapPt * 0.4}pt` }} />
          )}
        </header>
      ) : null}

      {visible("summary") && draft.content.summary.trim() ? (
        <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
          {sectionTitle("summary")}
          <p
            className="whitespace-pre-wrap text-neutral-800"
            style={textStyle(style.bodyPt, {
              face: "secondary",
              weight: style.bodyWeight,
            })}
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
                {sectionTitle("experience")}
                <div>
                  {entries.map((e, ei) => (
                    <div
                      key={e.id}
                      style={{
                        marginTop: ei === 0 ? 0 : `${style.contentBlockGapPt}pt`,
                      }}
                    >
                      <p
                        className="text-neutral-900"
                        style={textStyle(style.bodyPt, {
                          face: "secondary",
                          weight: "semibold",
                        })}
                      >
                        {style.dateAlign === "left" ? dateSpan(e.start, e.end) : null}
                        {e.company.trim() || "Company"}
                        {style.dateAlign === "right" ? dateSpan(e.start, e.end) : null}
                      </p>
                      {e.title.trim() ? (
                        <p
                          className="text-neutral-800"
                          style={textStyle(style.bodyPt, {
                            face: "secondary",
                            weight: style.bodyWeight,
                          })}
                        >
                          {e.title.trim()}
                        </p>
                      ) : null}
                      {locationLine(e.location)}
                      <ul
                        className="list-none"
                        style={{
                          margin: 0,
                          padding: 0,
                          marginTop: `${style.insideBlockGapPt}pt`,
                        }}
                      >
                        {e.bullets
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li
                              key={`${e.id}-b-${i}`}
                              className="text-neutral-800"
                              style={{
                                ...textStyle(style.bodyPt, {
                                  face: "secondary",
                                  weight: style.bodyWeight,
                                }),
                                paddingLeft: "8pt",
                                textIndent: "-8pt",
                                marginTop: i === 0 ? 0 : `${style.insideBlockGapPt}pt`,
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
            const grid =
              style.educationLayout === "inline"
                ? ({
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: `${style.contentBlockGapPt}pt`,
                  } as CSSProperties)
                : undefined;
            return (
              <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
                {sectionTitle("education")}
                <div style={grid}>
                  {entries.map((e, ei) => (
                    <div
                      key={e.id}
                      style={
                        style.educationLayout === "stacked"
                          ? { marginTop: ei === 0 ? 0 : `${style.contentBlockGapPt}pt` }
                          : undefined
                      }
                    >
                      <p
                        className="text-neutral-900"
                        style={textStyle(style.bodyPt, {
                          face: "secondary",
                          weight: "semibold",
                        })}
                      >
                        {style.dateAlign === "left" ? dateSpan(e.start, e.end) : null}
                        {style.educationShowBy === "degree"
                          ? e.degree.trim() || e.school.trim()
                          : e.school.trim() || e.degree.trim()}
                        {style.dateAlign === "right" ? dateSpan(e.start, e.end) : null}
                      </p>
                      {(style.educationShowBy === "degree" ? e.school.trim() : e.degree.trim()) ? (
                        <p
                          className="text-neutral-800"
                          style={textStyle(style.bodyPt, {
                            face: "secondary",
                            weight: style.bodyWeight,
                          })}
                        >
                          {style.educationShowBy === "degree" ? e.school.trim() : e.degree.trim()}
                        </p>
                      ) : null}
                      {locationLine(
                        [e.location.trim(), e.details.trim()].filter(Boolean).join(" · "),
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })()
        : null}

      {visible("skills") && skillRows.length ? (
        <section style={{ marginTop: `${style.sectionGapPt}pt` }}>
          {sectionTitle("skills")}
          {style.skillsCategoryMode === "categories" &&
          skillRows.some((r) => r.kind === "category") ? (
            <div>
              {skillRows.map((row, i) => (
                <p
                  key={`skill-row-${i}`}
                  className="text-neutral-800"
                  style={{
                    ...textStyle(style.bodyPt, {
                      face: "secondary",
                      weight: style.bodyWeight,
                    }),
                    marginTop: i === 0 ? 0 : `${style.insideBlockGapPt}pt`,
                  }}
                >
                  {row.kind === "category" ? (
                    <>
                      <span
                        style={{
                          fontWeight: RESUME_FONT_WEIGHTS.semibold.css,
                        }}
                      >
                        {row.category}:
                      </span>{" "}
                      {row.items.join(", ")}
                    </>
                  ) : (
                    row.items.join(", ")
                  )}
                </p>
              ))}
            </div>
          ) : style.skillsLayout === "columns" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(2, style.skillsColumns)}, minmax(0, 1fr))`,
                columnGap: "8pt",
                rowGap: `${style.insideBlockGapPt}pt`,
              }}
            >
              {skillRows
                .flatMap((r) =>
                  r.kind === "category" ? [`${r.category}: ${r.items.join(", ")}`] : r.items,
                )
                .map((item, i) => (
                  <p
                    key={i}
                    className="text-neutral-800"
                    style={textStyle(style.bodyPt, {
                      face: "secondary",
                      weight: style.bodyWeight,
                    })}
                  >
                    {item}
                  </p>
                ))}
            </div>
          ) : (
            <p
              className="text-neutral-800"
              style={textStyle(style.bodyPt, {
                face: "secondary",
                weight: style.bodyWeight,
              })}
            >
              {skillRows
                .map((r) =>
                  r.kind === "category"
                    ? `${r.category}: ${r.items.join(", ")}`
                    : r.items.join(" · "),
                )
                .join(" · ")}
            </p>
          )}
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
                {sectionTitle("projects")}
                <div>
                  {entries.map((p, pi) => (
                    <div
                      key={p.id}
                      style={{
                        marginTop: pi === 0 ? 0 : `${style.contentBlockGapPt}pt`,
                      }}
                    >
                      <p
                        className="text-neutral-900"
                        style={textStyle(style.bodyPt, {
                          face: "secondary",
                          weight: "semibold",
                        })}
                      >
                        {[p.name.trim(), p.link.trim()].filter(Boolean).join(" — ")}
                      </p>
                      {p.description.trim() ? (
                        <p
                          className="text-neutral-800"
                          style={{
                            ...textStyle(style.bodyPt, {
                              face: "secondary",
                              weight: style.bodyWeight,
                            }),
                            marginTop: `${style.insideBlockGapPt}pt`,
                          }}
                        >
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
                                ...textStyle(style.bodyPt, {
                                  face: "secondary",
                                  weight: style.bodyWeight,
                                }),
                                paddingLeft: "8pt",
                                textIndent: "-8pt",
                                marginTop: `${style.insideBlockGapPt}pt`,
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
                {sectionTitle("certifications")}
                <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                  {entries.map((c, i) => (
                    <li
                      key={c.id}
                      className="text-neutral-800"
                      style={{
                        ...textStyle(style.bodyPt, {
                          face: "secondary",
                          weight: style.bodyWeight,
                        }),
                        marginTop: i === 0 ? 0 : `${style.insideBlockGapPt}pt`,
                      }}
                    >
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

export function ResumeCreatorPreview({
  draft,
  className,
}: {
  draft: ResumeCreatorDraft;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const { width: pageW, height: pageH } = pageSizePt(draft.style.pageFormat);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const pxPerPt = 96 / 72;
      const paperCssPx = pageW * pxPerPt;
      setScale(Math.min(1, w / paperCssPx));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageW]);

  const pxPerPt = 96 / 72;
  const paperWpx = pageW * pxPerPt;
  const paperHpx = pageH * pxPerPt;
  const formatLabel = draft.style.pageFormat === "letter" ? "US Letter" : "A4";

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 shrink-0 px-1">
        <p className="aavedak-section-title text-foreground">Live preview</p>
        <p className="aavedak-meta text-muted-foreground mt-0.5">
          {formatLabel} · {draft.style.bodyPt}pt body ·{" "}
          {RESUME_CREATOR_FONTS[draft.style.primaryFont].label}/
          {RESUME_CREATOR_FONTS[draft.style.secondaryFont].label} · margins {draft.style.marginXPt}/
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
