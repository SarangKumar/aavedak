import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],
  // Lint in CI / husky; skip during `next build` so missing root ESLint deps
  // (e.g. Vercel Services install) cannot fail image generation.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
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

export default nextConfig;
