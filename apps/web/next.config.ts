import path from "node:path";

import { loadEnvConfig, updateInitialEnv } from "@next/env";
import type { NextConfig } from "next";

// One env for the whole monorepo: load the repo-root .env / .env.local (shared with FastAPI).
// Values already in process.env (Vercel project env, shell) always win; on Vercel there are
// no env files, so this is a no-op there.
// forceReload: Next has already loaded (and cached) apps/web env by the time this runs.
const rootEnv = loadEnvConfig(
  path.resolve(__dirname, "../.."),
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);
// Next resets process.env to its startup snapshot before loading apps/web env files (and for
// build workers); make the root values part of that snapshot so they survive.
updateInitialEnv(rootEnv.combinedEnv);

import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],
  // Lint in CI / husky; skip during `next build` so missing root ESLint deps
  // (e.g. Vercel Services install) cannot fail image generation.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      { source: "/jobs-tracker", destination: "/job-tracker", permanent: true },
      { source: "/jobs-tracker/:path*", destination: "/job-tracker/:path*", permanent: true },
      {
        source: "/follow-ups",
        destination: "/outreach",
        permanent: true,
      },
      {
        source: "/follow-ups/:path*",
        destination: "/outreach/:path*",
        permanent: true,
      },
    ];
  },
  // `pnpm dev` runs Next alone, so /svc/* would 404. Proxy it to local uvicorn (`pnpm dev:api`).
  // Production and `vercel dev` route /svc to FastAPI before Next, so this never applies there.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const target = (process.env.API_DEV_PROXY_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    return [{ source: "/svc/:path*", destination: `${target}/svc/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Accept-CH", value: "Sec-CH-Prefers-Color-Scheme" },
          { key: "Vary", value: "Sec-CH-Prefers-Color-Scheme" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
      { protocol: "https", hostname: "googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};

/**
 * `next dev` writes to `.next-dev`, everything else (build/start) to `.next`.
 * Sharing one folder let a `next build` run while the dev server was up overwrite the
 * CSS/chunk manifests the dev server serves — pages lost all styles until a restart.
 */
export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
