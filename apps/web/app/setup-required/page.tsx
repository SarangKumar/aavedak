import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Setup required",
  description: "Aavedak needs Neon Postgres and Neon Auth before it can run.",
};

export default function SetupRequiredPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-primary font-mono text-sm" lang="hi">
        आवेदक
      </p>
      <h1 className="text-foreground text-2xl font-semibold">Database setup required</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Aavedak needs Neon Postgres and Neon Auth. Set <code>DATABASE_URL</code>,{" "}
        <code>NEON_AUTH_BASE_URL</code>, <code>NEON_AUTH_JWKS_URL</code>, and a 32+ character{" "}
        <code>NEON_AUTH_COOKIE_SECRET</code>, then restart or redeploy. Google sign-in is configured
        in the Neon Console.
      </p>
      <Link href="/" className="text-primary text-sm underline underline-offset-2">
        Back home
      </Link>
    </main>
  );
}
