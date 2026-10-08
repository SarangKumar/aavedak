import "server-only";

/**
 * Admin allowlist via ADMIN_EMAILS (comma-separated).
 * Local fallback includes the project owner so /admin works without env.
 * Not a secret — only an email allowlist.
 */
/** Used when ADMIN_EMAILS is unset. Comma-separated env overrides this entirely. */
const LOCAL_FALLBACK_ADMINS = ["sarangkumar1578@gmail.com", "goyaladiti2912@gmail.com"] as const;

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return [...new Set(fromEnv)];
  return [...LOCAL_FALLBACK_ADMINS];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}
