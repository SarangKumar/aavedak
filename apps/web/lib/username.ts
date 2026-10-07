/**
 * Shareable profile slug: prefer Better Auth username when present,
 * else email local-part lowercased (e.g. sarang@gmail.com → sarang).
 */
export function usernameFromUser(user: {
  email?: string | null;
  name?: string | null;
  username?: string | null;
}): string {
  const stored = user.username?.trim();
  if (stored) {
    return stored.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
  }

  const email = user.email?.trim() ?? "";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const cleaned = local.replace(/[^a-z0-9._-]/g, "");
  if (cleaned) return cleaned;

  const fromName = (user.name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
  return fromName || "user";
}
