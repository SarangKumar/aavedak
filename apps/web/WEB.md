# Web app map (`apps/web`)

Area detail for the Next.js app. The shared rules (stack, layering, commands, Vinyaas-first UI, changelog, git safety) are in the root `AGENTS.md`; this file only maps where things live.

## Pages (`app/`)

| Route                                                         | Purpose                                                                         | Main component                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/`                                                           | Marketing homepage (flow diagram, openings globe, promises, FAQ)                | `app/page.tsx`, `components/home-*`                        |
| `/about`, `/how-it-works`, `/privacy`, `/terms`, `/changelog` | Public info pages; `/changelog` renders `CHANGELOG.md` via `lib/changelog.tsx`  | —                                                          |
| `/sign-in`, `/pending-approval`, `/closed`                    | Google sign-in, admin-approval wait, cap reached                                | `lib/auth.ts`, `lib/user-approval.ts`, `lib/user-cap.ts`   |
| `/onboarding`                                                 | Career profile + one resume upload, then `/dashboard`                           | `lib/onboarding.ts`, `lib/career-profile.ts`               |
| `/dashboard`                                                  | Applications/day chart, friends chart, top matches                              | `lib/dashboard.ts`, `lib/friends.ts`                       |
| `/jobs`                                                       | Discover / Applied tabs, Match + ATS per job                                    | `components/jobs-hub.tsx`, `lib/jobs.ts`                   |
| `/job-tracker`                                                | Applications board/list, job + cover letter trail                               | `components/job-tracker-board.tsx`, `lib/applications.ts`  |
| `/documents`                                                  | Resumes (ATS pill per card), cover letters, templates, email drafts             | `components/documents-hub.tsx`, `lib/resumes.ts`           |
| `/ats`                                                        | Multi-resume × multi-engine ATS runs (streamed)                                 | `components/ats-hub.tsx`                                   |
| `/resume-improver`                                            | Rule-based rewrite of one resume for a role; before/after scores; Jobs hand-off | `components/resume-improver.tsx`, `lib/improve-prefill.ts` |
| `/referrals`, `/follow-ups`, `/outreach`, `/people`           | Gmail outreach with a 20 s undo fuse before send; shared People table           | `lib/gmail.ts`, `lib/follow-ups.ts`, `lib/people.ts`       |
| `/friends/invite/*`                                           | Bidirectional friend links                                                      | `lib/friends.ts`                                           |
| `/[username]`, `/[username]/settings`                         | Shareable profile, settings, Danger Zone delete                                 | `lib/profile.ts`, `lib/account-delete.ts`                  |
| `/admin`                                                      | Approvals, discovery controls                                                   | `components/admin-discovery-panel.tsx`                     |

New protected pages must also be added to the `matcher` in `middleware.ts`.

## API (`app/api/`)

One folder per resource (`resumes`, `applications`, `ats`, `jobs`, `cover-letters`, `templates`, `referrals`, `follow-ups`, `outreach`, `people`, `friends`, `profile`, `preferences`, `gmail`, `account`, `admin`, `dashboard`, `onboarding`, `companies`, `analyses`, `link-preview`), plus `auth/[...all]` (Better Auth) and `cron/*` (Vercel daily crons, `CRON_SECRET`).

## ATS scores in the web app

- `/ats` runs go through `/api/ats/run` → `lib/ats-engines/profiles.ts` → `lib/ats-service.ts` → FastAPI. Inputs: role, JD, and `yearsExperience`, read silently from `profiles.years_experience` (collected in onboarding, edited in profile settings; not shown on `/ats`).
- The Documents card pill is the **native Aavedak engine** with the same defaults the `/ats` page starts with (profile's first preferred role or "Software Engineer", profile years, no JD) — `scoreResumeAts` / `cardAtsInputs` in `lib/resumes.ts`. `resumes.ats_inputs` records the inputs used; `/api/resumes` flags rows whose role/years differ or whose native engine version (from `/svc/v1/ats/health`) changed as `atsStale` (`lib/ats-card-score.ts`), and Documents rescores them on load.
- The **Final score** column (`components/final-score-cell.tsx`, on `/ats` and Jobs) is a weighted aggregate, not a mean: group weights native .5 / reference .35 / open source .15, split inside a group by per-engine weights, renormalised over engines that ran. All weights live in `ATS_GROUP_WEIGHTS` / `ATS_ENGINE_WEIGHTS` (`lib/ats-engines/aggregate.ts`); the cell's tooltip lists each engine's effective weight.
- There is no TypeScript ATS scorer. `lib/match-score.ts` only holds the quick resume↔JD token overlap used for job cards and cover-letter drafts.

## Shared UI pieces

- `lib/features.ts` — one icon, label and description per feature, used by the homepage flow, header and mobile nav, Cmd+K, page headings (`FeatureHeading`) and buttons that link to a feature (`FeatureIcon`). Add new features here rather than drawing icons inline.
- `components/ats-score-matrix.tsx` — the resume × engine score table on `/ats`, Jobs and the Improve page; `components/ats-engine-picker.tsx` — the engine picker on `/ats` and the Improve page.

## Limits

Resume PDFs: `RESUME_MAX_BYTES` in `lib/resume-upload.ts` (server-enforced). Per-user caps: `lib/profile-limits.ts`. Total users: `lib/user-cap.ts`.
