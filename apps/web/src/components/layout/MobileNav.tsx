"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/providers", label: "Providers" },
  { href: "/chains", label: "Chains" },
  { href: "/consumers", label: "Consumers" },
  { href: "/events", label: "Events" },
  { href: "/usage", label: "Usage" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground p-2">
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <div className="absolute top-16 left-0 right-0 border-b border-border z-50" style={{ backgroundColor: "#110e0ee1", backdropFilter: "blur(8px)" }}>
          <nav className="flex flex-col px-5 py-3 gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`py-2 text-sm ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
