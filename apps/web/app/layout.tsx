import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { AppShell } from "@/components/app-shell";
import { themeInitScript } from "@/lib/theme-script";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription =
  "Avsar (अवसर) — job discovery, application & career platform. Discover roles, prepare documents, track applications. Avsar recommends and prepares. You decide and send.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: {
    default: "Avsar · Job-search OS",
    template: "%s · Avsar",
  },
  description: siteDescription,
  applicationName: "Avsar",
  keywords: [
    "Avsar",
    "अवसर",
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
    siteName: "Avsar",
    title: "Avsar · Discover · Apply · Grow",
    description: siteDescription,
    images: [
      {
        url: "/brand/logo-icon.png",
        width: 1051,
        height: 1051,
        alt: "Avsar logo — stylized golden A",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Avsar · Job-search OS",
    description: siteDescription,
    images: ["/brand/logo-icon.png"],
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
  colorScheme: "light dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Avsar",
      alternateName: "अवसर",
      url: "/",
      description: siteDescription,
    },
    {
      "@type": "SoftwareApplication",
      name: "Avsar",
      alternateName: "अवसर",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-screen font-sans text-[15px] antialiased">
        <Script id="avsar-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
