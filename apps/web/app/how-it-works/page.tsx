import type { Metadata } from "next";
import Link from "next/link";

import { EngineKindBadge } from "@/components/ats-engine-badge";
import { PageToc, type TocItem } from "@/components/page-toc";
import { ShellWidth } from "@/components/shell-width";
import { Card } from "@/components/ui/card";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import type { EngineCapability, InputRequirement } from "@/lib/ats-engines/types";
import type { AtsMode } from "@/lib/ats-types";
import { CAREER_SOURCES, careerSourcesByProvider } from "@/lib/career-sources";
import { getSiteUrl, SITE_NAME } from "@/lib/site";

// Public, static content: no session or database reads. The ATS engines and the company
// list come from the same registries the app uses, so this page never disagrees with them.

const PAGE_TITLE = "How Aavedak works";
const PAGE_DESCRIPTION =
  "Where Aavedak's Discover jobs come from (company job boards and career pages), which junior engineering and tech roles are kept, how referral emails are sent from your own Gmail, and the 10 ATS engines: 1 native, 5 reference and 4 open source.";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "How it works",
  description: PAGE_DESCRIPTION,
  keywords: [
    "Aavedak",
    "how it works",
    "job discovery",
    "junior engineering jobs India",
    "fresher jobs",
    "career pages",
    "Greenhouse",
    "Lever",
    "Ashby",
    "ATS resume checker",
    "ATS score",
    "referral email",
  ],
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    type: "article",
    url: "/how-it-works",
    title: `${PAGE_TITLE} · Aavedak`,
    description: PAGE_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PAGE_TITLE} · Aavedak`,
    description: PAGE_DESCRIPTION,
  },
};

const ENGINE_COUNTS = {
  total: ATS_ENGINES.length,
  native: ATS_ENGINES.filter((e) => e.kind === "native").length,
  reference: ATS_ENGINES.filter((e) => e.kind === "reference").length,
  open_source: ATS_ENGINES.filter((e) => e.kind === "open_source").length,
};
const ENGINE_SPLIT = `${ENGINE_COUNTS.native} native, ${ENGINE_COUNTS.reference} reference and ${ENGINE_COUNTS.open_source} open source`;

const toc: TocItem[] = [
  { id: "flow", label: "The flow" },
  { id: "discover", label: "Discover jobs" },
  { id: "sources", label: "Where jobs come from", depth: 2 },
  { id: "companies", label: "Companies scanned", depth: 2 },
  { id: "rules", label: "Which jobs are kept", depth: 2 },
  { id: "recommendations", label: "Recommendations", depth: 2 },
  { id: "referrals", label: "Referrals" },
  { id: "ats", label: "ATS checks" },
  { id: "engines", label: `The ${ENGINE_COUNTS.total} ATS engines` },
];

const flow = [
  {
    title: "Discover",
    body: "Fresh junior roles from company career pages, ranked against your resume.",
  },
  {
    title: "Prepare",
    body: "Check your resume with ATS engines and keep resumes, cover letters and templates together.",
  },
  {
    title: "Apply and track",
    body: "Every application sits in a tracker with its status history and follow-ups.",
  },
  {
    title: "Ask for referrals",
    body: "Send referral and follow-up emails from your own Gmail, only after you confirm.",
  },
] as const;

const jobSources = [
  {
    title: "Job-board feeds behind career pages",
    body: "Most companies' career pages (careers.company.com, “Join us” pages) are powered by a hiring platform: Greenhouse, Lever, Ashby, SmartRecruiters or Workable. Each platform publishes the company's open roles through an official public API. Aavedak reads that feed, which holds the same postings the career page shows, and links you to the posting itself.",
  },
  {
    title: "Companies' own career pages",
    body: "Yes, dedicated career pages are supported too, when the page publishes standard job data (schema.org JobPosting, the format Google Jobs reads). Aavedak reads only the page it is given, respects the site's robots.txt and doesn't crawl the rest of the site. Admins can add any such career page.",
  },
] as const;

const jobRules = [
  {
    title: "Location",
    body: "In India, or remote and open to India (worldwide, anywhere, APAC or Asia). A plain “Remote” with no region is left out, because it usually means remote within another country.",
  },
  {
    title: "Every engineering role",
    body: "Any discipline: software, data engineering, analytics engineering, ML and AI, DevOps, cloud, SRE, QA and SDET, security, embedded and firmware, electronics, electrical, mechanical, civil, chemical, process and more. Indian junior titles that don't say “engineer” count too: Graduate Engineer Trainee (GET), Member of Technical Staff (MTS), Software Development Trainee, Technology Analyst, full-stack, frontend and backend developers.",
  },
  {
    title: "Other tech roles",
    body: "Data analyst and data scientist, business and BI analyst, machine learning and AI research, QA and testing, IT support and system, network and database administration, security analyst, UI/UX and product design, and associate product manager.",
  },
  {
    title: "Junior level",
    body: "The posting asks for under 3 years of experience. Senior, lead, staff, principal, architect and manager titles are skipped, as are internships.",
  },
  {
    title: "Not included",
    body: "Sales and pre-sales roles that borrow the word “engineer” (Sales Engineer, Solutions Engineer), engineering managers, and non-tech roles such as marketing, finance or recruiting.",
  },
] as const;

const referralSteps = [
  {
    title: "Pick an application",
    body: "Choose from your open applications. A job from Discover that you haven't applied to yet can be picked too; it's added to your tracker as Bookmarked first, because every referral email belongs to an application.",
  },
  {
    title: "Pick people and a template",
    body: "Select the people at that company you want to reach and an email template. Placeholders like {{company}} and {{role}} fill in from the application. You can attach one of your resumes.",
  },
  {
    title: "Confirm, then 20 seconds to undo",
    body: "Nothing is sent until you confirm. After that, a 20-second countdown runs on screen with an Undo button. Then the emails go out from your own Gmail account, one per person.",
  },
  {
    title: "Follow up",
    body: "The Already sent tab lists applications where you've reached out, with when each person was last contacted. Follow-ups use their own templates, and you must wait at least an hour between follow-ups to the same person.",
  },
] as const;

const modes: Array<{ mode: AtsMode; title: string; body: string }> = [
  {
    mode: "resume_only",
    title: "Resume only",
    body: "Just your resume. Engines score structure, wording, impact and formatting.",
  },
  {
    mode: "role_match",
    title: "Role match",
    body: "Resume plus a job title. Engines compare your resume with that role's usual skills.",
  },
  {
    mode: "job_match",
    title: "Job match",
    body: "Resume plus a job description. Engines compare your resume with that specific posting.",
  },
];

const MODE_LABEL: Record<AtsMode, string> = {
  resume_only: "Resume only",
  role_match: "Role match",
  job_match: "Job match",
};

const KIND_GROUPS: Array<{ kind: EngineCapability["kind"]; title: string; body: string }> = [
  {
    kind: "native",
    title: "Native",
    body: "Aavedak's own scorer. It credits skills only when your resume shows evidence for them.",
  },
  {
    kind: "reference",
    title: "Reference",
    body: "Modelled on how popular resume checkers describe their scoring in public. They are approximations, not the vendors' own engines, and Aavedak is not affiliated with these companies.",
  },
  {
    kind: "open_source",
    title: "Open source",
    body: "Adapted from open-source resume analyzers, following the formulas in their source code. Each one links to its original project.",
  },
];

function requirementText(label: string, value: InputRequirement): string | null {
  if (value === "required") return `${label} required`;
  if (value === "optional") return `${label} optional`;
  return null;
}

function engineInputs(engine: EngineCapability): string {
  return [requirementText("Job title", engine.title), requirementText("JD", engine.jd)]
    .filter(Boolean)
    .join(" · ");
}

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="space-y-1">
      <p className="text-primary/90 font-mono text-[11px] uppercase tracking-wide">{eyebrow}</p>
      <h2 id={id} className="aavedak-display text-foreground scroll-mt-24 text-xl sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}

function SubHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-foreground scroll-mt-24 text-[15px] font-semibold tracking-tight">
      {children}
    </h3>
  );
}

function jsonLd() {
  const base = getSiteUrl();
  const url = `${base}/how-it-works`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        headline: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        url,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: base },
        about: { "@type": "SoftwareApplication", name: SITE_NAME, url: base },
        author: { "@type": "Person", name: "Sarang Kumar", url: "https://sarangkumar.vercel.app" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: base },
          { "@type": "ListItem", position: 2, name: "How it works", item: url },
        ],
      },
    ],
  };
}

export default function HowItWorksPage() {
  const providerGroups = careerSourcesByProvider();

  return (
    <ShellWidth className="aavedak-fade-up py-10 sm:py-14">
      <script
        type="application/ld+json"
        // Static, server-built object; `<` is escaped so the JSON can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_13rem] xl:gap-14">
        <article className="min-w-0 space-y-12">
          <header className="max-w-2xl space-y-3">
            <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
              आवेदक
            </p>
            <h1 className="aavedak-display text-foreground text-3xl sm:text-4xl">{PAGE_TITLE}</h1>
            <p className="text-muted-foreground text-[15px] leading-relaxed">
              Where the jobs come from, how referral emails are sent, and how the ATS engines score
              your resume. Aavedak recommends and prepares. You decide and send.
            </p>
            {/* Below lg the right-hand contents column is hidden, so show the links here. */}
            <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 lg:hidden">
              {toc
                .filter((item) => item.depth !== 2)
                .map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="text-primary inline-flex min-h-8 items-center text-[13px] hover:underline"
                  >
                    {item.label}
                  </a>
                ))}
            </nav>
          </header>

          {/* Flow */}
          <section className="space-y-4">
            <SectionHeading id="flow" eyebrow="Overview" title="The flow" />
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {flow.map((item, index) => (
                <li key={item.title}>
                  <Card className="border-border/80 h-full gap-1.5 rounded-lg p-4 shadow-sm">
                    <p className="text-primary font-mono text-[12px]">{index + 1}</p>
                    <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-muted-foreground text-[13px] leading-relaxed">{item.body}</p>
                  </Card>
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
              You sign in with Google. New accounts are approved by an admin before the workspace
              opens.
            </p>
          </section>

          {/* Discover jobs */}
          <section className="space-y-8">
            <div className="space-y-3">
              <SectionHeading id="discover" eyebrow="Jobs" title="How Discover jobs works" />
              <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
                Every night Aavedak checks the career pages of {CAREER_SOURCES.length} companies,
                keeps only the junior engineering and tech roles that fit, and recommends the best
                matches to you. It never invents jobs, and no job is shown without a link to the
                original posting.
              </p>
            </div>

            <div className="space-y-3">
              <SubHeading id="sources">Where the jobs come from</SubHeading>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {jobSources.map((item) => (
                  <Card
                    key={item.title}
                    className="border-border/80 gap-1.5 rounded-lg p-4 shadow-sm"
                  >
                    <h4 className="text-foreground text-[13px] font-semibold tracking-tight">
                      {item.title}
                    </h4>
                    <p className="text-muted-foreground text-[13px] leading-relaxed">{item.body}</p>
                  </Card>
                ))}
              </div>
              <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
                Not covered yet: career pages on platforms without a public job feed (such as
                Workday, Darwinbox, Oracle or SuccessFactors) that also don&apos;t publish job data
                on the page. LinkedIn, Naukri, Indeed, Glassdoor, Wellfound and similar job sites
                don&apos;t allow automated reading, so Aavedak doesn&apos;t scrape them. Found a
                role there? Add it yourself with <span className="text-foreground">Add job</span> or{" "}
                <span className="text-foreground">Paste JD</span> on the Jobs page.
              </p>
            </div>

            <div className="space-y-3">
              <SubHeading id="companies">
                Which companies are scanned ({CAREER_SOURCES.length})
              </SubHeading>
              <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
                These companies&apos; job boards were checked and had current openings in India or
                open to India when they were added. Each name links to the careers board Aavedak
                reads. Admins can add more career pages, so the live list can be longer than this.
              </p>
              <div className="space-y-3">
                {providerGroups.map((group) => (
                  <Card
                    key={group.provider}
                    className="border-border/80 gap-2 rounded-lg p-4 shadow-sm"
                  >
                    <h4 className="text-foreground flex items-baseline gap-2 text-[13px] font-semibold tracking-tight">
                      {group.label}
                      <span className="text-muted-foreground font-normal tabular-nums">
                        {group.sources.length}
                      </span>
                    </h4>
                    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-relaxed">
                      {group.sources.map((source) => (
                        <li key={source.careersUrl}>
                          <a
                            href={source.careersUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary hover:underline"
                          >
                            {source.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <SubHeading id="rules">Which jobs are kept</SubHeading>
              <dl className="grid max-w-3xl grid-cols-1 gap-3">
                {jobRules.map((rule) => (
                  <div key={rule.title} className="space-y-0.5">
                    <dt className="text-foreground text-[13px] font-medium">{rule.title}</dt>
                    <dd className="text-muted-foreground text-[13px] leading-relaxed">
                      {rule.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="space-y-3">
              <SubHeading id="recommendations">How you get recommendations</SubHeading>
              <ul className="text-muted-foreground max-w-2xl list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
                <li>
                  Each new job is scored against your resume and your career preferences: skills,
                  preferred roles and locations. Jobs below the match threshold are not recommended.
                </li>
                <li>
                  You get up to 50 new matches a day, best match first. They stay in Discover until
                  you apply, bookmark or ignore them.
                </li>
                <li>
                  Change your career preferences and Discover is re-ranked straight away. Don&apos;t
                  want to wait for the nightly scan? Use{" "}
                  <span className="text-foreground">Refresh jobs</span> on the Jobs page.
                </li>
                <li>
                  A job leaves Discover 30 days after it was posted, or as soon as the company takes
                  it down. You can turn recommendations off in Profile settings → Job discovery.
                </li>
              </ul>
            </div>
          </section>

          {/* Referrals */}
          <section className="space-y-5">
            <SectionHeading
              id="referrals"
              eyebrow="Referrals"
              title="How the Referrals page works"
            />
            <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
              The Referrals page is where you ask people at a company to refer you. It has three
              columns: your active applications, the email, and the people you&apos;re writing to.
              Mail is sent through your own Gmail, after you connect it with Google. Aavedak never
              sends anything you haven&apos;t confirmed.
            </p>
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {referralSteps.map((item, index) => (
                <li key={item.title}>
                  <Card className="border-border/80 h-full gap-1.5 rounded-lg p-4 shadow-sm">
                    <p className="text-primary font-mono text-[12px]">{index + 1}</p>
                    <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-muted-foreground text-[13px] leading-relaxed">{item.body}</p>
                  </Card>
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
              Search and status filters at the top narrow the application list. The{" "}
              <span className="text-foreground">Needs referral</span> tab shows applications you
              haven&apos;t reached out for yet. Email templates live on the Documents page.
            </p>
          </section>

          {/* ATS */}
          <section className="space-y-5">
            <SectionHeading id="ats" eyebrow="ATS" title="How the ATS page works" />
            <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
              Companies often screen resumes with applicant tracking systems (ATS) before a person
              reads them. The ATS page runs your resume through {ENGINE_COUNTS.total} different
              engines ({ENGINE_SPLIT}), so you can see where they agree and what is missing before
              you apply.
            </p>
            <div className="space-y-3">
              <h3 className="text-foreground text-[15px] font-semibold tracking-tight">
                Three modes, picked from what you give it
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {modes.map((m) => (
                  <Card key={m.mode} className="border-border/80 gap-1.5 rounded-lg p-4 shadow-sm">
                    <h4 className="text-foreground text-[13px] font-semibold tracking-tight">
                      {m.title}
                    </h4>
                    <p className="text-muted-foreground text-[13px] leading-relaxed">{m.body}</p>
                  </Card>
                ))}
              </div>
            </div>
            <ul className="text-muted-foreground max-w-2xl list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
              <li>
                Pick one or more resumes and engines. Each resume and engine pair runs on its own,
                and its progress shows live in the results table.
              </li>
              <li>
                Each score is shown as a ring with its verdict. Open one to see the breakdown:
                matched and missing skills, the checks behind the number, and suggested fixes.
              </li>
              <li>
                The <span className="text-foreground">Final score</span> column is the average of
                every engine that ran for that resume.
              </li>
              <li>
                An engine that needs a job description or title you didn&apos;t provide shows{" "}
                <span className="text-foreground">Needs input</span> instead of guessing.
              </li>
            </ul>
          </section>

          {/* Engines */}
          <section className="space-y-5">
            <SectionHeading
              id="engines"
              eyebrow="ATS"
              title={`The ${ENGINE_COUNTS.total} ATS engines`}
            />
            <p className="text-muted-foreground max-w-2xl text-[14px] leading-relaxed">
              Aavedak runs{" "}
              <span className="text-foreground font-medium">
                {ENGINE_COUNTS.total} engines: {ENGINE_COUNTS.native} native,{" "}
                {ENGINE_COUNTS.reference} reference and {ENGINE_COUNTS.open_source} open source
              </span>
              . Each one is tagged Native, Ref or OSS on the ATS page.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {KIND_GROUPS.map((group) => (
                <Card
                  key={group.kind}
                  className="border-border/80 gap-1.5 rounded-lg p-4 shadow-sm"
                >
                  <p className="text-foreground flex items-center gap-2 text-[13px] font-semibold">
                    <span className="tabular-nums">{ENGINE_COUNTS[group.kind]}</span>
                    {group.title}
                    <EngineKindBadge
                      engineId={ATS_ENGINES.find((e) => e.kind === group.kind)?.id ?? "aavedak"}
                    />
                  </p>
                  <p className="text-muted-foreground text-[12px] leading-relaxed">{group.body}</p>
                  <p className="text-foreground/80 text-[12px] leading-relaxed">
                    {ATS_ENGINES.filter((e) => e.kind === group.kind)
                      .map((e) => e.name)
                      .join(", ")}
                  </p>
                </Card>
              ))}
            </div>

            <ol className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {ATS_ENGINES.map((engine, index) => (
                <li key={engine.id}>
                  <Card className="border-border/80 h-full gap-2 rounded-lg p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-foreground text-[14px] font-semibold tracking-tight">
                        {engine.name}
                      </h3>
                      <EngineKindBadge engineId={engine.id} />
                    </div>
                    <p className="text-foreground/90 text-[13px] leading-relaxed">
                      {engine.shortDescription}
                    </p>
                    <p className="text-muted-foreground text-[12px] leading-relaxed">
                      {engine.algoBlurb}
                    </p>
                    <dl className="text-muted-foreground mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-[11px]">
                      <dt className="text-foreground/80">Modes</dt>
                      <dd>{engine.supportedModes.map((m) => MODE_LABEL[m]).join(" · ")}</dd>
                      <dt className="text-foreground/80">Inputs</dt>
                      <dd>{engineInputs(engine) || "Resume only"}</dd>
                      {engine.referenceRepo ? (
                        <>
                          <dt className="text-foreground/80">Source</dt>
                          <dd className="min-w-0 break-all">
                            <a
                              href={`https://${engine.referenceRepo}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {engine.referenceRepo}
                            </a>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </Card>
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground max-w-2xl text-[12px] leading-relaxed">
              No engine here is the real screening system any particular company uses. Treat the
              scores as guidance: look for skills that keep showing up as missing across engines.
            </p>
          </section>

          <p className="text-muted-foreground text-[13px]">
            More about the project on the{" "}
            <Link href="/about" className="text-primary hover:underline">
              About page
            </Link>
            , and what changed recently in the{" "}
            <Link href="/changelog" className="text-primary hover:underline">
              changelog
            </Link>
            .
          </p>
        </article>

        <aside className="hidden lg:block">
          <PageToc items={toc} className="sticky top-24" />
        </aside>
      </div>
    </ShellWidth>
  );
}
