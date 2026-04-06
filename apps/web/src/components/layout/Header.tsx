"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNav } from "./MobileNav";
import { SearchBar } from "./SearchBar";
import { LastUpdateBadge } from "./LastUpdateBadge";

const TESTNET_URL = process.env.NEXT_PUBLIC_TESTNET_URL ?? "https://info-testnet.lavanet.xyz";
const MAINNET_URL = process.env.NEXT_PUBLIC_MAINNET_URL ?? "https://info.lavanet.xyz";
const IS_TESTNET = process.env.NEXT_PUBLIC_NETWORK === "testnet";

export function Header() {
  const pathname = usePathname();
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const handleScroll = () => {
      setOpacity(window.scrollY < 60 ? 1 : 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-border px-4 md:px-6 header-fade"
      style={{ backgroundColor: "var(--navbar-background-color)", opacity }}
    >
      <div className="md:hidden">
        <MobileNav />
      </div>

      <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base shrink-0">
        <img
          src="/lava-logo.svg"
          alt="Lava Logo"
          className="h-6 w-auto"
          style={{ maxWidth: "fit-content", marginBottom: "3px", marginRight: "10px", minWidth: "fit-content" }}
        />
        <span className="sr-only">Lava</span>
      </Link>

      <nav className="topbar-nav flex-col text-lg font-medium md:flex md:flex-row md:items-center md:text-sm gap-3 md:gap-4 lg:gap-5">
        <Link href="/" className={`nav-link ${isActive("/") && pathname === "/" ? "nav-link-selected" : ""}`}>
          Dashboard
        </Link>
        <Link href="/providers" className={`nav-link ${isActive("/provider") ? "nav-link-selected" : ""}`}>
          Providers
        </Link>
        <Link href="/chains" className={`nav-link ${isActive("/chain") ? "nav-link-selected" : ""}`}>
          Chains
        </Link>
        <Link href="/consumers" className={`nav-link ${isActive("/consumer") ? "nav-link-selected" : ""}`}>
          Consumers
        </Link>
        <a href="https://rewards.lavanet.xyz" className="nav-link" target="_blank" rel="noopener noreferrer">
          Rewards
        </a>
        <a href="https://stats.lavanet.xyz" className="nav-link" target="_blank" rel="noopener noreferrer">
          <span className="whitespace-nowrap">Network Stats</span>
        </a>
        <Link href="/usage" className={`nav-link ${isActive("/usage") ? "nav-link-selected" : ""}`}>
          Usage
        </Link>
      </nav>

      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        {/* Mainnet / Testnet toggle — pill style matching jsinfo-ui */}
        <div
          className="flex items-center gap-1 rounded-full p-1 bg-muted cursor-pointer hover:bg-muted/80 transition-all duration-300 ease-in-out hover:shadow-md shrink-0"
          onClick={() => { window.location.href = IS_TESTNET ? MAINNET_URL : TESTNET_URL; }}
        >
          <div className={`px-3 py-1 rounded-full text-sm transition-all duration-300 ${
            !IS_TESTNET
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:scale-105"
          }`}>
            Mainnet
          </div>
          <div className={`px-3 py-1 rounded-full text-sm transition-all duration-300 ${
            IS_TESTNET
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:scale-105"
          }`}>
            Testnet
          </div>
        </div>
        <LastUpdateBadge />
        <SearchBar />
      </div>
    </header>
  );
}
