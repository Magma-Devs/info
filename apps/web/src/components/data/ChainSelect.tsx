"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronsUpDown, Search, X, Check } from "lucide-react";
import { getChainIcon } from "@/lib/chain-icons";

function ChainIcon({ chainId, size = 16 }: { chainId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  if (failed) {
    return (
      <span
        className="rounded-sm shrink-0 bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground"
        style={{ width: px, height: px }}
      >
        {chainId.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={getChainIcon(chainId)}
      alt=""
      className="rounded-sm shrink-0"
      style={{ width: px, height: px }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

interface ChainSelectProps {
  chains: string[];
  selected: string;
  onChange: (chain: string) => void;
}

/** Desktop: inline dropdown */
function DesktopChainSelect({ chains, selected, onChange }: ChainSelectProps) {
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

  const filtered = useMemo(
    () => chains.filter((c) => c.toLowerCase().includes(search.toLowerCase())),
    [chains, search],
  );

  return (
    <div className="relative hidden md:block" ref={ref}>
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

/** Mobile: full-width trigger + full-screen picker modal */
function MobileChainSelect({ chains, selected, onChange }: ChainSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      setSearch("");
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const filtered = useMemo(
    () => chains.filter((c) => c.toLowerCase().includes(search.toLowerCase())),
    [chains, search],
  );

  const pick = (chain: string) => {
    onChange(chain);
    setOpen(false);
  };

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-between w-full h-11 bg-card border border-border rounded-md px-3 text-sm text-foreground hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 truncate">
          {selected !== "all" && <ChainIcon chainId={selected} size={18} />}
          <span className="truncate">{selected === "all" ? "All Chains" : selected}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 ml-2 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search chains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-base text-foreground outline-none flex-1 placeholder:text-muted-foreground"
            />
            <button
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2">
            <button
              onClick={() => pick("all")}
              className={`flex items-center gap-3 w-full px-3 py-3.5 rounded-lg text-base text-left transition-colors ${
                selected === "all" ? "bg-accent/15 text-foreground border border-accent/30" : "hover:bg-muted/50 text-foreground"
              }`}
            >
              <span className="w-[18px] h-[18px] rounded-sm shrink-0 bg-muted/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground">★</span>
              <span className="flex-1">All Chains</span>
              {selected === "all" && <Check size={18} className="text-accent" />}
            </button>

            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No chains match &ldquo;{search}&rdquo;
              </div>
            ) : (
              filtered.map((chain) => (
                <button
                  key={chain}
                  onClick={() => pick(chain)}
                  className={`flex items-center gap-3 w-full px-3 py-3.5 rounded-lg text-base text-left transition-colors ${
                    selected === chain ? "bg-accent/15 text-foreground border border-accent/30" : "hover:bg-muted/50 text-foreground"
                  }`}
                >
                  <ChainIcon chainId={chain} size={18} />
                  <span className="flex-1 truncate">{chain}</span>
                  {selected === chain && <Check size={18} className="text-accent" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChainSelect(props: ChainSelectProps) {
  return (
    <>
      <MobileChainSelect {...props} />
      <DesktopChainSelect {...props} />
    </>
  );
}
