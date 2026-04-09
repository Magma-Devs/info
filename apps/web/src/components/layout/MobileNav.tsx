"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home, Server, Link2, Gift, Activity, ExternalLink } from "lucide-react";

const TESTNET_URL = process.env.NEXT_PUBLIC_TESTNET_URL ?? "https://info-testnet.lavanet.xyz";
const MAINNET_URL = process.env.NEXT_PUBLIC_MAINNET_URL ?? "https://info.lavanet.xyz";
const IS_TESTNET = process.env.NEXT_PUBLIC_NETWORK === "testnet";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/chains", label: "Chains", icon: Link2 },
  { href: "/usage", label: "Usage", icon: Activity },
];

const EXTERNAL_ITEMS = [
  { href: "https://rewards.lavanet.xyz", label: "Rewards", icon: Gift },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  useEffect(() => { close(); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        <span className="sr-only">Toggle menu</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 top-16 z-40 bg-black/60 backdrop-blur-sm"
          onClick={close}
        />
      )}

      <div
        className={`fixed top-16 left-0 bottom-0 z-50 w-72 border-r border-border shadow-2xl transform transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "var(--navbar-background-color, hsl(0 0% 3.9%))" }}
      >
        <nav className="flex flex-col p-4 gap-1">
          {/* Mainnet / Testnet toggle */}
          <div
            className="flex items-center gap-1 rounded-full p-1 bg-muted cursor-pointer mb-3"
            onClick={() => { window.location.href = IS_TESTNET ? MAINNET_URL : TESTNET_URL; }}
          >
            <div className={`flex-1 text-center px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
              !IS_TESTNET
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            }`}>
              Mainnet
            </div>
            <div className={`flex-1 text-center px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
              IS_TESTNET
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            }`}>
              Testnet
            </div>
          </div>

          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Explorer
          </div>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(href)
                  ? "bg-white/15 text-white border border-white/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive(href) ? "text-white" : ""}`} />
              {label}
            </Link>
          ))}

          <div className="my-2 border-t border-border" />

          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            External
          </div>
          {EXTERNAL_ITEMS.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              <ExternalLink className="h-3 w-3 ml-auto opacity-40" />
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
