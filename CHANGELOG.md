# Changelog

All notable changes to Aavedak are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **ATS — four open-source-based engines** — Open ATS, ATS Resume Checker, Resume Skills Extractor and Hybrid Resume Analyzer. Each one adapts the scoring formulas found in that project's source code. Every report shows its own weighted breakdown, severity-ranked findings, fixes linked to those findings, its score type, and the places where it differs from the original. These engines need the scoring service and show a clear error rather than a substitute score when it's unavailable.
- **ATS — live processing stages** — Each result cell now shows the stage the backend is actually working on (Parsing Resume, Extracting Skills, Matching Keywords, Calculating Score, …) instead of a generic "Analyzing…". Runs can be cancelled, and failed cells offer Retry.
- **ATS — specific outcomes and engine badges** — Cells now say "Needs input", "Unsupported mode", "Parsing failed", "Analysis failed", or "Service unavailable" rather than a blank score. Each engine has its own badge (monogram, color and border style), used the same way in the selector, the table and the detail view.
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
