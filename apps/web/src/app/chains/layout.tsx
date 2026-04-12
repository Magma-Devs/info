import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chains",
  description: "All supported blockchain chains on Lava Network — provider counts, 30-day relay volume, and compute unit usage.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
