import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ErrorBoundary } from "@/components/data/ErrorBoundary";

import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lava Info",
  description: "Lava Network Info Hub",
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
      </body>
    </html>
  );
}
