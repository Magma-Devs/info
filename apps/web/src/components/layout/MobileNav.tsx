"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Home,
  Server,
  Link2,
  Gift,
  Flame,
  Activity,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { IS_TESTNET, getToggleUrl } from "@/lib/network";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/chains", label: "Chains", icon: Link2 },
  { href: "/usage", label: "Usage", icon: Activity, external: true },
  { href: "https://rewards.lavanet.xyz", label: "Rewards", icon: Gift, external: true },
  { href: "https://burn.lavanet.xyz", label: "Burn", icon: Flame, external: true },
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
        className="p-3 rounded-lg text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Toggle menu"
      >
        {open ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
        <span className="sr-only">Toggle menu</span>
      </button>

      <div
        className={`fixed top-[72px] left-0 right-0 bottom-0 z-50 bg-background transform transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col p-5 gap-1 overflow-y-auto h-full pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {/* Mainnet / Testnet toggle */}
          <div
            className="flex items-center gap-1 rounded-full p-1 bg-muted cursor-pointer mb-6 shadow-inner"
            onClick={() => { window.location.href = getToggleUrl(); }}
          >
            <div className={`flex-1 text-center px-3 py-4 rounded-full text-lg font-semibold transition-all duration-300 ${
              !IS_TESTNET
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground"
            }`}>
              Mainnet
            </div>
            <div className={`flex-1 text-center px-3 py-4 rounded-full text-lg font-semibold transition-all duration-300 ${
              IS_TESTNET
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground"
            }`}>
              Testnet
            </div>
          </div>

          {NAV_ITEMS.map(({ href, label, icon: Icon, external }, idx) => {
            const active = !external && isActive(href);
            const className = `relative flex items-center gap-4 pl-4 pr-3 py-4 rounded-xl text-lg font-medium transition-colors ${
              active
                ? "bg-accent/15 text-accent"
                : "text-foreground/80 hover:text-foreground active:bg-muted/50"
            }`;
            const iconClass = `h-6 w-6 shrink-0 ${active ? "text-accent" : "text-muted-foreground"}`;
            // Insert a divider before the first external item so users see a
            // clear break between in-app routes and outbound links.
            const showDivider = external && !NAV_ITEMS[idx - 1]?.external;

            const item = external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className={className}
              >
                <Icon className={iconClass} />
                {label}
                <ExternalLink className="h-5 w-5 ml-auto opacity-40" />
              </a>
            ) : (
              <Link key={href} href={href} onClick={close} className={className}>
                {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-accent" />}
                <Icon className={iconClass} />
                {label}
              </Link>
            );

            if (showDivider) {
              return (
                <div key={`group-${href}`}>
                  <div className="my-3 h-px bg-border/60" aria-hidden />
                  {item}
                </div>
              );
            }
            return item;
          })}
        </nav>
      </div>
    </>
  );
}
