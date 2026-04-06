"use client";

import { useState } from "react";
import Link from "next/link";
import { useChainNames } from "@/hooks/use-chain-names";
import { getChainIcon } from "@/lib/chain-icons";

interface ChainLinkProps {
  chainId: string;
  className?: string;
  /** Show full chain name with specId below */
  showName?: boolean;
}

/** Chain ID with icon and link, shows full name from API on hover */
export function ChainLink({ chainId, className, showName }: ChainLinkProps) {
  const { getName } = useChainNames();
  const fullName = getName(chainId);
  const iconUrl = getChainIcon(chainId);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Link
      href={`/chain/${chainId}`}
      className={`inline-flex items-center gap-2 ${className ?? "text-accent hover:underline"}`}
      title={fullName !== chainId ? `${chainId} — ${fullName}` : chainId}
    >
      {!imgFailed ? (
        <img
          src={iconUrl}
          alt=""
          className={`${showName ? "w-6 h-6" : "w-4 h-4"} rounded-sm shrink-0`}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className={`${showName ? "w-6 h-6 text-[10px]" : "w-4 h-4 text-[9px]"} rounded-sm shrink-0 bg-muted flex items-center justify-center font-medium text-muted-foreground`}>
          {chainId.charAt(0).toUpperCase()}
        </span>
      )}
      {showName && fullName !== chainId ? (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">{fullName}</span>
          <span className="text-xs text-muted-foreground">{chainId}</span>
        </div>
      ) : (
        chainId
      )}
    </Link>
  );
}
