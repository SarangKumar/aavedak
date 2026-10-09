# Changelog

All notable changes to Aavedak are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Jobs — cleaner layout** — The Discover and Applied tabs, search and source filters now sit at the top of the job panel, and the list and details scroll side by side with no empty space below. Each card shows where the job came from (Greenhouse, Lever, Ashby, LinkedIn and so on).
- **Jobs — simpler job details** — Everything about a job (source, match, experience, salary, posting age, days left) fits in one compact header. The job description has a copy button.
- **Jobs — ATS check for each job** — Score any of your resumes against a job with the engine you pick, right on the Jobs page. "Detailed scan on ATS page" opens the ATS page with the job title, description, resumes and engine already filled in, for the full report and improvement tips.
- **Jobs — how it works** — A "How Jobs works" section at the bottom explains where jobs come from, how matches are picked, expiry, and the ATS check.
- **Job tracker — application dates** — Each application card shows the date you applied (or the date it was added, for bookmarked jobs). The list view has an Applied column too.
- **Jobs — daily discovery of junior engineering roles in India** — Aavedak now scans company career pages every night (public Greenhouse, Lever, Ashby, SmartRecruiters and Workable boards, plus career pages that publish structured job data) and keeps only India-based engineering roles that ask for under 3 years of experience. Each day you get up to 50 new matches ranked against your resume and career preferences. Sites without permitted access (LinkedIn, Naukri, Indeed and similar) are not scraped.
- **Jobs — Discover and Applied tabs** — Discover lists your new matches and the jobs you added yourself. Each shows when it was posted, how many days it has left, the experience it asks for, and why it matches your profile. Mark applied or Bookmark moves a job to Applied, and Ignore hides it. Matches stay until you act on them.
- **Jobs — 30-day expiry** — A discovered job leaves both tabs 30 days after it was posted. If you had only bookmarked it, were preparing, had applied, or were waiting to hear back, the application is marked Rejected with a "Job expired" badge. Your history stays in the tracker and you can change the status back. Applications at assessment, interview or offer are never touched.
- **Jobs — original post link on every card** — Each job card links to the original posting, and so does the job's detail view. Discovery only stores jobs that come with their original link.
- **Jobs — people at the company** — Each job shows contacts at that company who could help with a referral, ordered by how relevant their role is and by votes from other users.
- **People — votes** — You can upvote or downvote any contact once and change your vote later. Votes show how useful others found a contact, not whether that person will refer you. Contacts added by admin discovery are labelled Discovered.
- **Profile — Job discovery setting** — Turn daily recommendations off or on in Profile settings.
- **Admin — Discovery panel** — Admins can manage the career-page list (search, enable or disable, bulk-add URLs, re-import the verified starter list of 118 company boards) and start a scan on demand. They can also run expiry or ranking, follow run progress, retry failed items, and bulk-import thousands of people from a CSV. Imports only fill missing details, never mark emails as verified, and skip phone numbers.
- **Application history** — Every status change is now recorded, whether you made it or the job expired.

### Fixed

- **Admin — starting a job scan** — Starting the first scan no longer shows a false "service unavailable" error, and clicking it again resumes the scan in progress instead of starting a duplicate. First-time setup of the job sources is much faster.
- **ATS page loading state** — The loading skeleton now matches the ATS page: the five step cards (engines, resume, job content, review, results) and the scoring guide, instead of a generic placeholder.
- **Local development: pages losing all styles** — Running a production build while the dev server was up overwrote the files the dev server serves, so pages lost their styles until a restart. Development and production builds now keep their files apart.

### Removed

- **Sample and demo jobs** — The Jobs page no longer creates example jobs, and existing ones are deleted automatically. Applications or cover letters you made from them stay, without the job link.

### Changed

- **Smaller API deployment** — The Python function no longer ships the local development server or test tooling, and tests, scripts and docs are excluded from deployments, roughly halving the API bundle.
- **Refreshed UI components** — Avatars, cards, badges, file uploads, dividers, side panels and confirmation dialogs now use the official Vinyaas components, with smoother open and close animations.
- **Discovery moved to the API** — Job and people discovery now run in the FastAPI service as small, resumable batches. Nightly runs are spread across several daily schedules so no single run holds the database. The old daily web ingest was removed.
- **Jobs page** — The page now shows only jobs recommended to you, jobs you acted on, and jobs you added, not every shared job. Scores are no longer calculated while the page loads.

- **ATS — four open-source-based engines** — Open ATS, ATS Resume Checker, Resume Skills Extractor and Hybrid Resume Analyzer. Each one adapts the scoring formulas found in that project's source code. Every report shows its own weighted breakdown, severity-ranked findings, fixes linked to those findings, its score type, and the places where it differs from the original. These engines need the scoring service and show a clear error rather than a substitute score when it's unavailable.
- **ATS — open-source engines without a job description** — Open ATS and Hybrid Resume Analyzer now also run with just a resume, and all four run with just a job title. A title is matched against that role's skill profile. Resume Skills Extractor still needs a title or JD, because it can only score against something. Each report labels which kind of score it is.
- **ATS — live processing stages** — Each result cell now shows the stage the backend is actually working on (Parsing Resume, Extracting Skills, Matching Keywords, Calculating Score, …) instead of a generic "Analyzing…". Runs can be cancelled, and failed cells offer Retry.
- **ATS — specific outcomes and score rings** — Result cells show a circular score gauge (color ramps orange→green with the score) rather than a flat number, and say "Needs input", "Unsupported mode", "Parsing failed", "Analysis failed", or "Service unavailable" instead of a blank score. Engines are labelled by name with a small Native / OSS / Ref tag in the selector, table and detail view.
- **Dashboard applications/day charts** — One shared multi-line chart (you + friends as distinct colored series); range control on the chart bottom-right; counts derive from live applications (hard delete lowers the day).
- **Friends** — Profile invite URL; `/friends/invite/[token]` confirm; accepted friendships appear as lines on the shared dashboard graph.
- **Referrals** — 20s on-screen countdown before batch Gmail send; Attach resume in the Cold email preview (one uploaded PDF).
- **ATS** — `/ats` page + dashboard card; readiness / JD match scoring; inactive resumes can be permanently deleted (keep ≥1 active).
- **Tracker** — Download applications JSON backup for re-import.
- **Wipe script** — `scripts/wipe-all-data.mjs` clears Neon app + Better Auth tables and GCS `resumes/` (not GCP OAuth clients).

### Changed

- **Job tracker delete** — Hard-deletes applications (no longer archive-only) so activity graphs stay accurate.
- **Referrals add-person** — Company field uses creatable Company Select (not free text).

### Added

- **Real Gmail send** — Follow-up queue uses Gmail API (`gmail.send` + offline refresh); cron every 10m; re-consent banner on Referrals / Follow-ups / Profile.
- **SEO** — `sitemap.xml`, `robots.ts`, OG/Twitter image route, public index vs app `noindex`, JSON-LD retained.

- **Follow-ups** — Dedicated `/follow-ups` list: open/all/closed filters, create, mark done/dismiss/reopen, process due queue (Gmail stub).
- **People CRM** — Dedicated `/people` shell: search, add/edit drawer, archive/restore, link to applications.
- **About** — Public `/about` page with product principles and workspace map.

### Changed

- **Profile links** — Portfolio, LinkedIn, GitHub, LeetCode, HackerRank, X/Twitter, Website (persisted in `links_json`; legacy portfolio/linkedin columns kept in sync).
- **Cover letter footer** — Checkboxes pull email + links from profile (disabled when empty); live preview + PDF/DOCX use sans-serif.
- **Showcase resume** — Only one active resume for public profile; activating demotes others.
- **UI** — Slightly tighter global `--radius` (0.875rem → 0.75rem).

- **UI** — Smaller circular ⓘ tip; Vinyaas-default resize gutter (1px + grip chip); dummy/preview placeholders use John Doe / example.com (not personal email).
- **Cold templates** — “New blank template” clears editor and focuses title (fixed/ clarified Add new).
- **Cover letters** — Side panel of saved cover templates; searchable application Select; `{{role}}`/`{{company}}` vars; live PDF-style preview; footer fields (portfolio, email, LinkedIn, GitHub) in preview + PDF/DOCX.
- **Select** — Optional `searchable` filter on `SelectContent`.
- **Rebrand** — Product display name **Aavedak** (आवेदक); root folder `aavedak`; package/CSS prefixes; prod URL examples `https://aavedak.vercel.app`.
- **Documents** — Cold-email template editor: ⓘ (single circle, foreground) top-right on new-template card; Your templates flat like resumes. Cover letters company-specific + cover templates + PDF/DOCX download.
- **Referrals** — Grip drag handle; template select = saved only; confirm shows `[name | email]` badges + pending/no-Gmail callout.
- **Job tracker** — Cleaner Kanban cards (less chrome).
- **UI** — Slightly smaller block border radii (`rounded-2xl` → `rounded-xl`).
- **Layout** — Shared shell max-width + horizontal padding for nav and pages; denser→spacier page padding/gaps.
- **Job tracker** — Resizable Kanban columns (localStorage), search filter, Vinyaas Select for status (no native `<select>`).
- **Command palette** — ⌘/Ctrl+K (Vinyaas Command) for navigation, theme, sign out.
- **Theme** — Secondary/muted/borders charcoal-neutral (gold reserved for primary accent); larger card/badge type.

- **Referrals composer** — Three reorderable columns (Applications / Cold email / People), Gmail From locked to signed-in user, confirm + queue follow-ups (no send). Admin allowlist via `ADMIN_EMAILS` (+ local fallback). `POST /api/referrals/queue`.
- **Dashboard** — Live SQLite snapshot: status counts, active apps / follow-ups / resumes / jobs, recent applications (5), upcoming follow-ups (5). Optional `GET /api/dashboard`.

## [1.0.0] - 2026-10-07

First product cut of the Aavedak web app (local SQLite + Google Better Auth).

### Added

- **Auth** — Google-only sign-in via Better Auth; profile ensure on session.
- **Onboarding** — Require at least one PDF resume before the app shell.
- **Dashboard** — Signed-in home shell after onboarding.
- **Job tracker** — Kanban + list views, status columns, drag-and-drop status changes, archive scope, column visibility preferences.
- **Applications import** — Import Applications dialog with human-readable schema, sample JSON (including seeded applied roles), `.json` upload via Vinyaas FileUpload, strict all-or-nothing client + server validation, duplicate company+role skip summary. `POST /api/applications/import`, schema at `/schemas/applications-import.json` and `/api/applications/import/schema`.
- **Seed applied roles** — On job-tracker load, idempotent upsert of four applied applications (JioSaavn SDE-BE Mumbai, Kobie SDE Bangalore, Teradata SDE Hyderabad, Zuvees SDE-1 Bangalore) with `applied_at` / `created_at` around 2026-09-22–23. Also `POST /api/applications/seed-demo-applied`.
- **Documents** — Resumes (archive-not-delete), cover letters, text templates; PDF upload via FileUpload.
- **Referrals** — People contacts + follow-up tasks.
- **Jobs** — User-scoped jobs master-detail and pasted JD analyses.
- **Theme** — Dark/light brand theme, FOUC-safe cookie SSR, cropped logo, denser UI and micro-animations.
- **SEO** — Metadata, favicons, robots / webmanifest.
- **Changelog** — This file and public `/changelog` page.

### Notes

- Local-first data in `.data/app.db` (separate from Better Auth DB). Production MySQL / R2 planned later.
- Aavedak recommends and prepares; the user decides and sends.
