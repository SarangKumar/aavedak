import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avsar",
  description: "Personal job-search operating system",
  icons: { icon: "/brand/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
