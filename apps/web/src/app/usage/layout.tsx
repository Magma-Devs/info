import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Usage & Reliability",
  description: "Lava Network uptime and reliability metrics — compare decentralized RPC performance against traditional providers.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
