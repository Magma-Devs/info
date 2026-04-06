"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { Search } from "lucide-react";

interface SearchResult {
  id: string;
  name: string;
  type: "provider" | "consumer" | "spec";
  link: string;
  moniker: string;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useApi<{ data: SearchResult[] }>("/search");

  const results = query.length >= 2
    ? (data?.data ?? []).filter((r) =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.moniker.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 10)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative hidden md:block">
      <div className="flex items-center border border-border rounded-lg px-3 py-1.5 gap-2 bg-muted/30">
        <Search size={14} className="text-muted-foreground" />
        <input
          type="text"
          placeholder="Search providers, chains..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="bg-transparent text-sm text-foreground outline-none w-48 placeholder:text-muted-foreground"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => { router.push(r.link); setQuery(""); setOpen(false); }}
              className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center justify-between text-sm"
            >
              <div>
                <span className="text-foreground">{r.moniker || r.name}</span>
                {r.moniker && <span className="text-muted-foreground text-xs ml-2">{r.name.slice(0, 16)}...</span>}
              </div>
              <span className="text-xs text-muted-foreground capitalize">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
