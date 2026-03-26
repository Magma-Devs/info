"use client";

import Link from "next/link";
import { useChainNames } from "@/hooks/use-chain-names";

interface ChainLinkProps {
  chainId: string;
  className?: string;
}

/** Chain ID with link, shows full name from API on hover */
export function ChainLink({ chainId, className }: ChainLinkProps) {
  const { getName } = useChainNames();
  const fullName = getName(chainId);

  return (
    <Link
      href={`/chain/${chainId}`}
      className={className ?? "text-accent hover:underline"}
      title={fullName !== chainId ? `${chainId} — ${fullName}` : chainId}
    >
      {chainId}
    </Link>
  );
}
