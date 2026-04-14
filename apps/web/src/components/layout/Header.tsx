"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench } from "lucide-react";
import { MobileNav } from "./MobileNav";
import { SearchBar } from "./SearchBar";
import { LastUpdateBadge } from "./LastUpdateBadge";
import { api } from "@/lib/api-client";
import { IS_TESTNET, getToggleUrl } from "@/lib/network";

const IS_DEV = process.env.NODE_ENV === "development";

function DevToolsMenu() {
  const [open, setOpen] = useState(false);
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "done">("idle");
  const [mockChart, setMockChart] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("lava-mock-chart") === "true",
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleClearCache = useCallback(async () => {
    setCacheState("clearing");
    try {
      await api.delete("/cache");
      setCacheState("done");
      setTimeout(() => setCacheState("idle"), 1500);
    } catch {
      setCacheState("idle");
    }
  }, []);

  const handleToggleMockChart = useCallback(() => {
    const next = !mockChart;
    setMockChart(next);
    localStorage.setItem("lava-mock-chart", String(next));
    window.dispatchEvent(new Event("mock-chart-toggle"));
  }, [mockChart]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-8 h-8 rounded-md border border-dashed border-yellow-600/50 text-yellow-500 hover:bg-yellow-500/10 transition-colors"
        title="Dev Tools"
      >
        <Wrench size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-card shadow-lg z-50">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-yellow-500">Dev Tools</span>
          </div>
          <div className="p-1">
            <button
              onClick={handleClearCache}
              disabled={cacheState === "clearing"}
              className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            >
              {cacheState === "clearing"
                ? "Clearing..."
                : cacheState === "done"
                  ? "Cache cleared"
                  : "Reset cache"}
            </button>
            <button
              onClick={handleToggleMockChart}
              className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>Mock chart data</span>
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${mockChart ? "bg-green-900/50 text-green-400" : "bg-muted text-muted-foreground"}`}>
                {mockChart ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
        <a href="https://rewards.lavanet.xyz" className="nav-link" target="_blank" rel="noopener noreferrer">
          Rewards
        </a>
      </nav>

      <div className="flex items-center gap-4 ml-auto md:gap-2 lg:gap-4">
        {/* Mainnet / Testnet toggle — hidden on mobile (shown in MobileNav instead) */}
        <div
          className="hidden md:flex items-center gap-1 rounded-full p-1 bg-muted cursor-pointer hover:bg-muted/80 transition-all duration-300 ease-in-out hover:shadow-md shrink-0"
          onClick={() => { window.location.href = getToggleUrl(); }}
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
        {IS_DEV && <DevToolsMenu />}
      </div>
    </header>
  );
}
