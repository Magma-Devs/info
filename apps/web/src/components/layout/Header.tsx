"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNav } from "./MobileNav";
import { SearchBar } from "./SearchBar";
import { LastUpdateBadge } from "./LastUpdateBadge";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/providers", label: "Providers" },
  { href: "/chains", label: "Chains" },
  { href: "/consumers", label: "Consumers" },
  { href: "/events", label: "Events" },
  { href: "/usage", label: "Usage" },
];

const EXTERNAL_LINKS = [
  { href: "https://rewards.lavanet.xyz", label: "Rewards" },
  { href: "https://stats.lavanet.xyz", label: "Stats" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border" style={{ backgroundColor: "#110e0ee1", backdropFilter: "blur(8px)" }}>
      <div className="max-w-[1536px] mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="https://lava-fe-assets.s3.amazonaws.com/lava-icon.svg" alt="Lava" className="h-6 w-6" />
          <span className="text-lg font-semibold text-foreground hidden sm:inline">Lava Info</span>
        </Link>

        <nav className="hidden md:flex items-center gap-4 lg:gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm whitespace-nowrap transition-colors duration-150 ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {EXTERNAL_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors duration-150"
            >
              {item.label} ↗
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LastUpdateBadge />
          <SearchBar />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
