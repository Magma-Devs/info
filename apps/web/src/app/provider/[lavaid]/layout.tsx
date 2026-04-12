import type { Metadata } from "next";

interface Props {
  params: Promise<{ lavaid: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lavaid } = await params;
  const short = lavaid.length > 20 ? `${lavaid.slice(0, 12)}...${lavaid.slice(-6)}` : lavaid;
  return {
    title: `Provider ${short}`,
    description: `Lava Network provider ${lavaid} — staked chains, delegation, health status, relay performance, and QoS metrics.`,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
