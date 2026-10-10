# Changelog

All notable changes to Aavedak are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v0.1.0

First product cut of the Aavedak web app (2026-10-07) (local SQLite + Google Better Auth).

### Added

- **Jobs re-rank on career changes** — Saving Career preferences in Profile settings now re-ranks your Discover jobs straight away. Open recommendations are re-scored against the new preferences, ones that no longer reach the match threshold leave Discover, and new matches fill any remaining daily slots. Discover is ordered by match score, best first. The Documents page opens the tab in its link (`?tab=`, default Resumes), and a cover letter started from a job's Cover letter button preselects that job.
- **Profile — bio and projects** — The bio accepts up to 1,600 characters with a counter and grows as you type. Each project's Remove button sits on its title row.
- **Tracker — toolbar** — Search sits on the left of one toolbar with the view switch and actions on the right; the Kanban column choices open below it.
- **UI — upgraded component library** — The interface now uses Vinyaas 1.4.0 throughout. Dialogs are larger with a gentle open and close animation, toasts show an action button (such as Undo on the send countdown) with their own animation, and the command palette (⌘K) opens in the same dialog. Jobs and Referrals use the upgraded toggle groups for sorting, status filters and engine choices, and the Jobs tabs and sort toggle use the new styling. The job discovery setting in Profile settings is now a switch. Error and success messages are alerts, long lists scroll in themed scroll areas, search boxes and form fields share one input style, and the applied-date field uses a proper date picker. The cover-letter job picker is a searchable combobox.
- **UI — spinners only on the pressed button** — Buttons no longer spin together. On Jobs (Mark applied, Bookmark, Ignore), Referrals (queue and add person), Friends (New link and Remove) and Documents (Set as showcase and Archive), only the button you pressed shows its loading state; the others just disable until it finishes.
- **Jobs — tab and sort in the link** — The selected tab (Discover or Applied), the posted-date sort (newest or oldest) and the selected job are kept in the page address. Reloading the page or opening a shared link brings you back to the same view. Without them, the page opens on Discover, newest first.
- **Dashboard — redesigned with key stats and charts** — The dashboard opens with four headline numbers: active applications (with how many you logged this week compared with last week), response rate, interviews and pending follow-ups. A new conversion funnel shows how many applications reached screening, interview and offer, counting stages they passed through before a later rejection. Pipeline by status is now a horizontal bar chart covering every status, the applications-per-day chart has a compact 1M/3M/6M/12M switch, follow-ups are tagged Overdue, Today, This week or Later, and a Workspace strip links to saved jobs, resumes, cover letters, people and archived applications. **Top new matches** lists your five best open job recommendations with their match score, matched skills, posting age and a link to the original posting. **Needs a status update** lists applications sitting in Applied, Under review, Assessment or Interview for 14 days or more, so you can update them or mark them Ghosted or Rejected and keep your tracker accurate. The page is grouped top to bottom by purpose: Overview (headline numbers and a full-width applications-per-day chart), Needs attention, Jobs and applications, Pipeline health (status chart beside the funnel) and Workspace. Each block loads on its own with a placeholder in its place, so quick numbers show straight away and a slow block such as job matches doesn't hold up the rest. On phones the layout stacks cleanly and the chart's range switch moves below its title.
- **Jobs — Refresh jobs button** — Anyone signed in can now refresh jobs from the top bar of the Jobs page. It scans every company career page right away instead of waiting for the nightly run, and new matches appear as each batch finishes.
- **Referrals — search, status filter and unapplied jobs** — The top strip has a search box and status toggles (Not applied, Bookmarked, Preparing, Applied and more) to narrow the Active applications list. The list now includes jobs from the Jobs page you haven't applied to yet, marked "Not applied". Sending a referral for one adds it to your tracker as Bookmarked first. The strip sits closer to the columns.
- **Documents and ATS — pages load right away** — The rest of each page appears immediately while your resumes load, and only the resume list shows a skeleton. The ATS page no longer shows a full-page loader.
- **ATS and Jobs — final score column** — Each resume row ends with a Final score: the average of every engine score that ran for it, shown as a ring with its verdict. It is display only and does not open a detail view.
- **ATS and Jobs — faster pages** — Session lookups are shared within a request, the profile is no longer written on every page view, the site header streams in without holding up the page, and the Documents page loads its data in parallel.
- **Jobs — partial loading** — The Jobs heading shows straight away and only the job list and details show a skeleton while your matches load.
- **ATS and Jobs — final score alignment** — Placeholder dashes in the Final score column are centred. Scores are right-aligned so every ring lines up in one column.
- **Job tracker and Referrals — taller loaders** — The loading placeholders now use the same column height as the real boards, so the page no longer grows when your applications arrive.
- **Loading skeletons match the pages** — Loading placeholders now follow the current layouts of Referrals, Outreach, Follow-ups, Job tracker, People and Documents, so the page doesn't shift when content arrives.
- **Jobs — sort by posted date** — A toggle beside the Discover and Applied tabs sorts the list newest first (the default) or oldest first. Jobs without a posting date sort last.
- **ATS — mobile layout** — The results filters sit side by side in a two-column grid on phones, the results table uses narrower columns, and the Loaded from Jobs banner wraps.
- **Full-screen board button hidden on phones** — The expand control on Jobs, Referrals and Outreach only appears on larger screens.
- **Consistent full-page loaders** — Every full-page loading state now shares one frame: the same backdrop, container and screen-reader status, so each page's loader looks and announces itself the same way.
- **Jobs — no width shift** — The list pane keeps your saved width from the first paint, and the loading skeleton uses the same width and layout, so nothing jumps when jobs load.
- **Search icons** — Every search box now shows a magnifying-glass icon before the placeholder.
- **Referrals and Outreach — full-screen boards** — Like Jobs, the Referrals columns and the Outreach inbox can expand to a full-screen board and collapse back. Each top strip links to the other page, and in full-screen mode that link opens the other board full-screen too.
- **Referrals — active applications** — The left column now lists every open application, from your tracker and from jobs you applied to or bookmarked on Jobs, not just ones marked Applied. Each shows its status and a "From Jobs" tag where it applies. The page header is simpler: the Admin badge and Manage people button are gone, and Open outreach inbox moved to the top strip.
- **Jobs — full-screen board** — A top bar holds search, a source filter, Add job and Paste JD. The expand button opens the jobs board on its own full-screen page, and collapse brings you back to the same job.
- **Jobs — cleaner layout** — The job list and the job details are now two separate panels. The Discover and Applied tabs, search and source filters sit at the top of the list. Details are split into spaced sections for the job, the description, people at the company and the resume check, and both panels scroll on their own with no empty space below. Each card shows where the job came from (Greenhouse, Lever, Ashby, LinkedIn and so on).
- **Jobs — simpler job details** — Everything about a job (source, match, experience, salary, posting age, days left) fits in one compact header. The job description has a copy button.
- **Jobs — ATS check for each job** — Score your resumes against a job with as many ATS engines as you like at once, right on the Jobs page, in a resume-by-engine table like the ATS page. Columns are evenly spaced, scores and loading spinners sit centered in fixed-height cells so nothing jumps, and selected engines are outlined in the accent colour. "Detailed scan on ATS page" opens the ATS page with the job title, description, resumes and engine already filled in, for the full report and improvement tips.
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
- **Real Gmail send** — Follow-up queue uses Gmail API (`gmail.send` + offline refresh); cron every 10m; re-consent banner on Referrals / Follow-ups / Profile.
- **SEO** — `sitemap.xml`, `robots.ts`, OG/Twitter image route, public index vs app `noindex`, JSON-LD retained.
- **Follow-ups** — Dedicated `/follow-ups` list: open/all/closed filters, create, mark done/dismiss/reopen, process due queue (Gmail stub).
- **People CRM** — Dedicated `/people` shell: search, add/edit drawer, archive/restore, link to applications.
- **About** — Public `/about` page with product principles and workspace map.
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

### Changed

- **ATS — engines re-checked against their sources** — The four open-source engines were compared line by line with their original projects. Scores now match them more closely: similarity scoring uses the exact word list of the original library, and ATS Resume Checker rounds scores the way the original does.
- **ATS — Jobscan-, Resume Worded- and Rezi-style engines follow what the products publish** — Jobscan-style now weighs hard skills most (and frequent ones more), then education (only when the job asks for an advanced degree), job title, soft skills and other keywords. Resume Worded-style scores Impact, Brevity and Style checks. Rezi-style passes or fails its published checks (bullets per role, word count, full-month dates, pronouns, buzzwords, passive voice, grouped skills). Their exact weights are not public, so they remain approximations.
- **ATS — many more skills recognised** — Skill detection grew from about 55 to 126 skills, adding machine learning, GenAI (LLMs, RAG, prompt engineering, embeddings), data (feature engineering, data preprocessing, scikit-learn, pandas), testing, tooling and mobile skills. Job descriptions in these fields were previously under-counted, which made match scores too generous. The Jobscan-style title match is now all-or-nothing, like Jobscan's "title not found" check.
- **ATS — Jobscan-style works for non-software jobs** — When a job description mentions few software skills (a mechanical-engineering role, for example), the Jobscan-style engine now treats the job's own recurring terms as its hard skills. A software resume against such a job moved from about 2 to about 22, close to the 24 Jobscan itself reported.
- **ATS — Aavedak resume quality tells resumes apart** — Resume quality is now based on the share of strong, quantified and well-sized bullets instead of raw counts, so ordinary resumes no longer all land at 91–92. It also lowers the score for hedging phrases, passive voice, first-person pronouns, buzzwords and very long resumes, and suggests how to fix them.
- **Jobs page tweaks** — The source filter is wider, and "About the job" has a fixed maximum height in the normal view (it scrolls inside). In full screen it still stretches to fill the panel.
- **Version** — Aavedak is now labelled v0.1.0, since it hasn't had a public release yet.
- **ATS scores always come from the full scoring engine** — Every ATS engine now scores only through the scoring service. If the service is down, the result says "Service unavailable" instead of showing a simplified offline score that could differ from the real one.
- **Resizable panels** — The divider between side-by-side panels (Jobs, Outreach) is now a simple three-dot grip in a gap half as wide as before, instead of a border line and handle. In the Jobs resume check, the resume column stays in place while you scroll across engines.
- **Faster ATS scans** — When you score several resumes, they are now scanned at the same time instead of one after another, on both the ATS page and the Jobs page.
- **Smaller API deployment** — The Python function no longer ships the local development server or test tooling, and tests, scripts and docs are excluded from deployments, roughly halving the API bundle.
- **Refreshed UI components** — Avatars, cards, badges, file uploads, dividers, side panels and confirmation dialogs now use the official Vinyaas components, with smoother open and close animations.
- **Discovery moved to the API** — Job and people discovery now run in the FastAPI service as small, resumable batches. Nightly runs are spread across several daily schedules so no single run holds the database. The old daily web ingest was removed.
- **Jobs page** — The page now shows only jobs recommended to you, jobs you acted on, and jobs you added, not every shared job. Scores are no longer calculated while the page loads.
- **ATS — four open-source-based engines** — Open ATS, ATS Resume Checker, Resume Skills Extractor and Hybrid Resume Analyzer. Each one adapts the scoring formulas found in that project's source code. Every report shows its own weighted breakdown, severity-ranked findings, fixes linked to those findings, its score type, and the places where it differs from the original. These engines need the scoring service and show a clear error rather than a substitute score when it's unavailable.
- **ATS — open-source engines without a job description** — Open ATS and Hybrid Resume Analyzer now also run with just a resume, and all four run with just a job title. A title is matched against that role's skill profile. Resume Skills Extractor still needs a title or JD, because it can only score against something. Each report labels which kind of score it is.
- **ATS — live processing stages** — Each result cell now shows the stage the backend is actually working on (Parsing, Extracting, Matching, Scoring, …), each a single word so it fits the narrow cell instead of a generic "Analyzing…". Runs can be cancelled, and failed cells offer Retry.
- **ATS — specific outcomes and score rings** — Result cells show a circular score gauge (color ramps orange→green with the score) rather than a flat number, and say "Needs input", "Unsupported mode", "Parsing failed", "Analysis failed", or "Service unavailable" instead of a blank score. Engines are labelled by name with a small Native / OSS / Ref tag in the selector, table and detail view.
- **Dashboard applications/day charts** — One shared multi-line chart (you + friends as distinct colored series); range control on the chart bottom-right; counts derive from live applications (hard delete lowers the day).
- **Friends** — Profile invite URL; `/friends/invite/[token]` confirm; accepted friendships appear as lines on the shared dashboard graph.
- **Referrals** — 20s on-screen countdown before batch Gmail send; Attach resume in the Cold email preview (one uploaded PDF).
- **ATS** — `/ats` page + dashboard card; readiness / JD match scoring; inactive resumes can be permanently deleted (keep ≥1 active).
- **Tracker** — Download applications JSON backup for re-import.
- **Wipe script** — `scripts/wipe-all-data.mjs` clears Neon app + Better Auth tables and GCS `resumes/` (not GCP OAuth clients).
- **Job tracker delete** — Hard-deletes applications (no longer archive-only) so activity graphs stay accurate.
- **Referrals add-person** — Company field uses creatable Company Select (not free text).
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

### Fixed

- **Layout and toggle fixes** — Jobs and Inbox panes keep a fixed height instead of stretching to the page, the Jobs loading state matches the new split layout, application cards on the job tracker show the company with a role pill and the location with the applied date, the cover letter editor has the same variables info icon as the referral email editor, the ⌘K palette footer shows just ⌘K, and single-choice controls (chart range, inbox duration, Jobs sort) are single-select toggle groups.
- **ATS — long engine names keep the table centred** — Engine names that run long, such as Hybrid Resume Analyzer, wrap onto two lines in their column header instead of pushing the header off centre.
- **ATS and Jobs — final score reads as one unit** — Each Final score shows the ring and then its verdict, centred in the column. The rings line up in one vertical line whatever the verdict's length.
- **Jobs full-screen board** — Both panels now fill the full height, and "About the job" stretches to use the spare space.
- **Referrals loading state** — The loading placeholder now matches the real column widths, with the middle column twice as wide.
- **Outreach inbox layout** — The inbox now matches Jobs: a top strip with search, application filter, time range, Process due queue and expand, then the conversation list and the mail as two separate panels. The time-range buttons no longer stack vertically.
- **Frozen resume column** — On the ATS page and in the Jobs resume check, the resume column stays put while engine columns scroll, and its divider no longer scrolls away.
- **Admin — starting a job scan** — Starting the first scan no longer shows a false "service unavailable" error, and clicking it again resumes the scan in progress instead of starting a duplicate. First-time setup of the job sources is much faster.
- **ATS page loading state** — The loading skeleton now matches the ATS page: the five step cards (engines, resume, job content, review, results) and the scoring guide, instead of a generic placeholder.
- **Local development: pages losing all styles** — Running a production build while the dev server was up overwrote the files the dev server serves, so pages lost their styles until a restart. Development and production builds now keep their files apart.

### Removed

- **Sample and demo jobs** — The Jobs page no longer creates example jobs, and existing ones are deleted automatically. Applications or cover letters you made from them stay, without the job link.

### Notes

- Local-first data in `.data/app.db` (separate from Better Auth DB). Production MySQL / R2 planned later.
- Aavedak recommends and prepares; the user decides and sends.
