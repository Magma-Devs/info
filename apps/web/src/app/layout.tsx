import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ErrorBoundary } from "@/components/data/ErrorBoundary";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Lava Info",
  description: "Lava Network blockchain explorer and analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col">
        <Header />
        <ErrorBoundary>
          <main className="flex-1 max-w-[1536px] mx-auto w-full px-5 py-5">
            {children}
          </main>
        </ErrorBoundary>
        <Footer />
      </body>
    </html>
  );
}
