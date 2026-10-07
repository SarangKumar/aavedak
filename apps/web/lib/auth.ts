import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Local auth DB: SQLite via Better Auth's built-in Kysely adapter.
 * Production target is MySQL (Aiven). When ready, swap `database` for
 * mysql2 createPool(...) using AUTH_DATABASE_URL (or DATABASE_URL) —
 * keep socialProviders / plugins the same.
 */
function createSqliteDatabase() {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "local.db");
  return new Database(dbPath);
}

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

/** True when Google OAuth env is present — used to degrade UI without crashing. */
export const isGoogleAuthConfigured = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: createSqliteDatabase(),
  socialProviders: {
    ...(isGoogleAuthConfigured
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: "select_account",
          },
        }
      : {}),
  },
  // last plugin — sets cookies from server actions / RSC flows
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
