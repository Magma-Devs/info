"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronsUpDown } from "lucide-react";
import { getChainIcon } from "@/lib/chain-icons";

function ChainIcon({ chainId }: { chainId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="w-4 h-4 rounded-sm shrink-0 bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
        {chainId.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img src={getChainIcon(chainId)} alt="" className="w-4 h-4 rounded-sm shrink-0" loading="lazy" onError={() => setFailed(true)} />
  );
}

interface ChainSelectProps {
  chains: string[];
  selected: string;
  onChange: (chain: string) => void;
}

export function ChainSelect({ chains, selected, onChange }: ChainSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = chains.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between h-8 min-w-[140px] bg-card border border-border rounded-md px-2 text-xs text-foreground hover:bg-muted/50"
      >
        <span className="flex items-center gap-1.5 truncate">
          {selected !== "all" && <ChainIcon chainId={selected} />}
          {selected === "all" ? "All Chains" : selected}
        </span>
        <ChevronsUpDown className="h-3 w-3 ml-1 opacity-50 shrink-0" />
      </button>
      <div
        className={`absolute top-full mt-1 right-0 w-[220px] bg-card border border-border rounded-lg shadow-lg z-50 p-2 transition-all duration-150 origin-top ${
          open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {chains.length > 5 && (
          <input
            type="text"
            placeholder="Search chains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm text-foreground mb-2 outline-none"
          />
        )}
        <div className="max-h-[200px] overflow-y-auto">
          <button
            onClick={() => { onChange("all"); setOpen(false); setSearch(""); }}
            className={`flex items-center gap-2 w-full p-1.5 text-sm rounded ${selected === "all" ? "bg-accent/20 text-foreground" : "hover:bg-muted text-foreground"}`}
          >
            All Chains
          </button>
          {filtered.map((chain) => (
            <button
              key={chain}
              onClick={() => { onChange(chain); setOpen(false); setSearch(""); }}
              className={`flex items-center gap-2 w-full p-1.5 text-sm rounded ${selected === chain ? "bg-accent/20 text-foreground" : "hover:bg-muted text-foreground"}`}
            >
              <ChainIcon chainId={chain} />
              <span>{chain}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
