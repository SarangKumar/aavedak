# Domain glossary

User, Profile, Resume, Application, Job, JobAnalysis, Company, Person, Template, OutreachDraft, SentMessage, FollowUpTask, ImportJob — see conversation freeze. Application ≠ Job. Documents hub includes resumes + future cover letters/templates.

## Discovery terms

- **Shared job** — a `jobs` row with `user_id` NULL, discovered from a career source; stored
  once for everyone. **Manual job** — `user_id` set (added or pasted by one user).
- **Career source** (`company_sources`) — one company board/page in the scan registry
  (provider + token). **Job source ref** (`job_sources`) — one source's listing of a shared
  job; a job can have several.
- **Recommendation** — `user_job_state.recommended_at` set for a user; shown on Discover
  until applied, bookmarked, ignored, expired, or closed.
- **Expired** — older than 30 days from posting (`expired_at`). **Closed** — no longer
  listed by its sources (`closed_at`).
- **Discovery run** — persistent, resumable batch of work items (a scan or a people import).
- **Person contact** — an email/LinkedIn for a person with source, provenance, and
  verification (`unverified` | `inferred` | `verified`). **Job–person relevance** — how
  useful a person likely is for a referral to a job. **Vote** — a user's up/down signal on a
  person (one per user).
