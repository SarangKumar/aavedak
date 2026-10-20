/**
 * Roles the resume improver has hand-written guidance for — one per pack in
 * `apps/api/app/improve/data/role_guidance/*.json` (minus `generic.json`). Keep the labels in
 * step with those files: each one has to map back to its pack through the API's
 * `infer_role_key`. Any other role still works and falls back to the generic guidance, so these
 * are suggestions, never a closed list.
 */
export const IMPROVE_GUIDED_ROLES = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "Data Engineer",
  "Cloud / DevOps Engineer",
  "Product Designer",
] as const;
