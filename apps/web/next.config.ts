import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* better-sqlite3 is a native Node addon — keep it external for the server. */
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
