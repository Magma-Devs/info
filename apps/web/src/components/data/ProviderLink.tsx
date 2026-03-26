import Link from "next/link";

interface ProviderLinkProps {
  address: string;
  moniker?: string;
}

/** Provider address as link, shows moniker if available */
export function ProviderLink({ address, moniker }: ProviderLinkProps) {
  const display = moniker || `${address.slice(0, 16)}...`;
  return (
    <Link
      href={`/provider/${address}`}
      className="text-accent hover:underline"
      title={address}
    >
      {display}
    </Link>
  );
}
