import "server-only";

/**
 * Aavedak uses Neon Postgres for app data and Neon Auth (Managed Better Auth)
 * for Google sign-in. There is no local SQLite or self-hosted Better Auth path.
 */

export class DatabaseConfigError extends Error {
  readonly code = "database_config";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DatabaseConfigError";
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Neon connection string. Only DATABASE_URL is read. */
export function resolvePostgresUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return null;
  if (/^postgres(ql)?:\/\//i.test(value)) return value;
  return null;
}

export function isPostgresConfigured(): boolean {
  return Boolean(resolvePostgresUrl());
}

export function neonAuthBaseUrl(): string | null {
  const value = process.env.NEON_AUTH_BASE_URL?.trim();
  return value || null;
}

export function neonJwksUrl(): string | null {
  const value = process.env.NEON_AUTH_JWKS_URL?.trim();
  return value || null;
}

export function isNeonAuthConfigured(): boolean {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim() ?? "";
  return Boolean(neonAuthBaseUrl() && neonJwksUrl() && secret.length >= 32);
}

export function neonAuthOptions(): {
  baseUrl: string;
  cookies: { secret: string };
} {
  const baseUrl = neonAuthBaseUrl();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim() ?? "";
  if (!baseUrl || !neonJwksUrl()) {
    throw new DatabaseConfigError(
      "NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL are required. Copy both from the Neon Console (branch → Auth).",
    );
  }
  if (secret.length < 32) {
    throw new DatabaseConfigError(
      "NEON_AUTH_COOKIE_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
    );
  }
  return { baseUrl, cookies: { secret } };
}

export function isDatabaseFailure(err: unknown): boolean {
  if (err instanceof DatabaseConfigError) return true;
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /postgres|neon|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|DATABASE_URL|NEON_AUTH|password authentication failed|getaddrinfo|certificate|28P01|57P01|fetch failed/i.test(
    message,
  );
}

export function databaseErrorMessage(err: unknown): string {
  if (err instanceof DatabaseConfigError) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Database is unavailable.";
}
