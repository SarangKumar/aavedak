# Avsar — frozen decisions (summary)

## Job / Application
- Application can exist without Job; required: company, role, location (`Remote` OK).
- Snapshot fields are tracker truth; `job_id` optional.
- Multiple apps per company allowed; duplicates warned, not blocked.
- Pasted JD → user analysis; no auto global Job.

## Status
Enum only: bookmarked, preparing, applied, under_review, assessment, interview, offer, rejected, withdrawn, ghosted, archived.
No custom statuses; show/hide Kanban columns. User-only status changes.
Bookmarked = no follow-up automation. Ghosted = no reply (user judgment).

## Resumes
PDF only; active/inactive (delete = deactivate). ≥1 resume for onboarding. Under profile/settings APIs.

## Email
Outreach via user Gmail; confirm before send; checkbox batch after template finalized.
Missing vars: warn + override. Daily digest to user separate from outreach.

## Admin / people
Admin allowlist emails; admin may view resumes. Person email: private user override + optional suggest; no silent global overwrite.

## Auth spam
Google OAuth only — accepted as sufficient anti-spam for accounts for now.
