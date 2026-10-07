import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { themeInitScript } from "@/lib/theme-script";
import { parseThemeMode, serverPrefersDark, THEME_KEY } from "@/lib/theme";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription = SITE_DESCRIPTION;
const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Aavedak · Job-search OS",
    template: "%s · Aavedak",
  },
  description: siteDescription,
  applicationName: "Aavedak",
  keywords: [
    "Aavedak",
    "आवेदक",
    "job search",
    "job tracker",
    "career",
    "applications",
    "resume",
    "referrals",
    "job discovery",
  ],
  authors: [{ name: "Sarang Kumar", url: "https://sarangkumar.vercel.app" }],
  creator: "Sarang Kumar",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Aavedak",
    title: "Aavedak · Discover · Apply · Grow",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Aavedak · Job-search OS",
    description: siteDescription,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F0" },
    { media: "(prefers-color-scheme: dark)", color: "#090909" },
  ],
  colorScheme: "dark light",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: "आवेदक",
      url: siteUrl,
      description: siteDescription,
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      alternateName: "आवेदक",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description: siteDescription,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      author: {
        "@type": "Person",
        name: "Sarang Kumar",
        url: "https://sarangkumar.vercel.app",
      },
    },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const themeMode = parseThemeMode(cookieStore.get(THEME_KEY)?.value);
  const prefersHeader = headerStore.get("sec-ch-prefers-color-scheme");
  const isDark = serverPrefersDark(themeMode, prefersHeader);

  return (
    <html
      lang="en"
      className={cn(geistSans.variable, geistMono.variable, "h-full", isDark && "dark")}
      style={{ colorScheme: isDark ? "dark" : "light" }}
      data-theme={themeMode}
      // Theme class may differ slightly from SSR when cookie is "system" and CH hint is missing;
      // also absorbs browser extension attrs mutating <html>.
      suppressHydrationWarning
    >
      <head>
        {/* Blocking theme sync before first paint (cookie SSR is primary; this is the client backup). */}
        <script id="aavedak-theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/*
        suppressHydrationWarning: browser extensions (e.g. Grammarly) inject attributes like
        data-new-gr-c-s-check-loaded / data-gr-ext-installed on <body>. That is not an app bug.
        html already has suppressHydrationWarning for theme class sync.
      */}
      <body
        className="bg-background text-foreground min-h-screen font-sans text-[15px] antialiased"
        suppressHydrationWarning
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
