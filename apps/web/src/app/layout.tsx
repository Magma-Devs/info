import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ErrorBoundary } from "@/components/data/ErrorBoundary";
import { SwrProvider } from "./swr-provider";

import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://info.lavanet.xyz";

export const metadata: Metadata = {
  title: {
    default: "Lava Info — Lava Network Explorer",
    template: "%s | Lava Info",
  },
  description:
    "Explore Lava Network providers, chains, staking, relay performance, and supply data. Real-time blockchain analytics for the Lava decentralized RPC network.",
  keywords: [
    "Lava Network", "blockchain explorer", "RPC providers", "staking",
    "decentralized RPC", "relay analytics", "Web3 infrastructure",
  ],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    siteName: "Lava Info",
    title: "Lava Info — Lava Network Explorer",
    description:
      "Explore Lava Network providers, chains, staking, relay performance, and supply data.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
    title: "Lava Info — Lava Network Explorer",
    description:
      "Real-time analytics for Lava Network providers, chains, and relay performance.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  initialScale: 0.6,
  userScalable: true,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`min-h-screen bg-background antialiased ${inter.variable} ${inter.className}`}>
        <SwrProvider>
          <div className="flex min-h-screen mx-auto flex-col">
            <Header />
            <ErrorBoundary>
              <main className="body-content">
                <div className="body-content-boundary">
                  <div className="body-content-boundary-inner">
                    {children}
                  </div>
                </div>
              </main>
            </ErrorBoundary>
            <Footer />
          </div>
        </SwrProvider>
      </body>
    </html>
  );
}
