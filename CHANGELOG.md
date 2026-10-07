# Changelog

All notable changes to Avsar are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Referrals composer** — Three reorderable columns (Applications / Cold email / People), Gmail From locked to signed-in user, confirm + queue follow-ups (no send). Admin allowlist via `ADMIN_EMAILS` (+ local fallback). `POST /api/referrals/queue`.
- **Dashboard** — Live SQLite snapshot: status counts, active apps / follow-ups / resumes / jobs, recent applications (5), upcoming follow-ups (5). Optional `GET /api/dashboard`.

## [1.0.0] - 2026-10-07

First product cut of the Avsar web app (local SQLite + Google Better Auth).

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
- Avsar recommends and prepares; the user decides and sends.
