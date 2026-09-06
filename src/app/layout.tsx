import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://adrunr.app"),
  title: "Adrunr — Ads operations platform",
  description:
    "Ads ops for agencies and advertisers. Connect Google Ads with OAuth, run paused and dry-run campaign work, and grow onto GA4, Clarity, Meta, TikTok, and LinkedIn — only for accounts you authorize.",
  openGraph: {
    title: "Adrunr — Ads operations platform",
    description:
      "Multi-channel ads operations: Google Ads live, GA4/Clarity/Meta/TikTok/LinkedIn schema-ready. Ops tools, not autopilot.",
    url: "https://adrunr.app",
    siteName: "Adrunr",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
