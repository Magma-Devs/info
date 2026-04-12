import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Providers",
  description: "Browse all Lava Network RPC providers — stake, delegation, commission, active chains, and 30-day relay performance.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
