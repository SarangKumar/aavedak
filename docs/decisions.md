# Aavedak — frozen decisions (summary)

## Job / Application

- Application can exist without Job; required: company, role, location (`Remote` OK).
- Snapshot fields are tracker truth; `job_id` optional.
- Multiple apps per company allowed; duplicates warned, not blocked.
- Pasted JD → user analysis; no auto global Job.
- Shared (discovered) jobs are stored once globally; recommendations, applications, ignores,
  and votes are per user. Discovery covers junior tech roles (engineering in any
  discipline plus data, ML/AI, QA, IT, security, design and junior product roles; stated
  minimum experience < 3 years) in India or remote roles open to India from permitted sources only. Never invent jobs — there are no
  sample or demo jobs, in any environment.
- A shared job expires 30 days after its posting date (first-seen date if the source gives
  none) and leaves the Discover and Applied tabs; manual/pasted jobs never expire.

## Status

Enum only: bookmarked, preparing, applied, under_review, assessment, interview, offer, rejected, withdrawn, ghosted, archived.
No custom statuses; show/hide Kanban columns. User-only status changes, with one system
exception: when a linked shared job expires, an application in bookmarked / preparing /
applied / under_review / ghosted moves to rejected with reason `job_expired`, once (a
system event is recorded; if the user reopens it, it is never re-rejected). Assessment,
interview, offer, withdrawn, and archived are never changed by the system. Every status
change is kept in application history.
Bookmarked = no follow-up automation. Ghosted = no reply (user judgment).

## Resumes

PDF only; active/inactive (delete = deactivate). ≥1 resume for onboarding. Under profile/settings APIs.

## Email

Outreach via user Gmail; confirm before send; checkbox batch after template finalized.
Missing vars: warn + override. Daily digest to user separate from outreach.

## Admin / people

Admin allowlist emails; admin may view resumes. Person email: private user override + optional suggest; no silent global overwrite.
People are shared, linked to companies (not jobs or users). Admin bulk discovery only fills
empty fields, stores contacts with source/provenance as unverified (never marked verified,
never inferred), and never imports phone numbers. Votes: one per user per person,
changeable; a community signal only, separate from job relevance.

## Auth spam

Google OAuth only — accepted as sufficient anti-spam for accounts for now.
