"use client";

import Link from "next/link";
import { useApi } from "@/hooks/use-api";

interface ProviderLinkProps {
  address: string;
  moniker?: string;
  identity?: string;
  showAvatar?: boolean;
}

/** Provider address as link with optional avatar, shows moniker if available */
export function ProviderLink({ address, moniker, identity, showAvatar = false }: ProviderLinkProps) {
  const display = moniker || `${address.slice(0, 16)}...`;
  const avatarUrl = showAvatar && identity
    ? `/providers/${address}/avatar?identity=${identity}`
    : null;
  const { data: avatarResp } = useApi<{ url: string | null }>(avatarUrl);
  const hasAvatar = showAvatar && avatarResp?.url;

  return (
    <Link
      href={`/provider/${address}`}
      className="inline-flex items-center gap-1.5 text-accent hover:underline"
      title={address}
    >
      {showAvatar && (
        hasAvatar ? (
          <img
            src={avatarResp.url!}
            alt=""
            className="w-5 h-5 rounded-full shrink-0"
            loading="lazy"
          />
        ) : (
          <span className="w-5 h-5 rounded-full shrink-0 bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
            {(moniker || address).charAt(0).toUpperCase()}
          </span>
        )
      )}
      {display}
    </Link>
  );
}
