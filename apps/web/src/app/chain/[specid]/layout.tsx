import type { Metadata } from "next";

interface Props {
  params: Promise<{ specid: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { specid } = await params;
  return {
    title: `Chain ${specid}`,
    description: `${specid} chain on Lava Network — staked providers, health status, relay charts, and compute unit analytics.`,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
