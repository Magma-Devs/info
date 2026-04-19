"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { Search, Loader2, X } from "lucide-react";
import { getChainIcon } from "@/lib/chain-icons";

interface SearchResult {
  id: string;
  name: string;
  type: "provider" | "spec";
  link: string;
  moniker: string;
  identity?: string;
}

function ChainIcon({ specId }: { specId: string }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = getChainIcon(specId);

  if (failed) {
    return (
      <span className="w-6 h-6 rounded-md shrink-0 bg-muted/80 flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
        {specId.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className="w-6 h-6 rounded-md shrink-0"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ProviderIcon({ address, moniker, identity }: { address: string; moniker: string; identity?: string }) {
  const avatarUrl = identity
    ? `/providers/${address}/avatar?identity=${identity}`
    : null;
  const { data: avatarResp } = useApi<{ url: string | null }>(avatarUrl);

  if (avatarResp?.url) {
    return (
      <img
        src={avatarResp.url}
        alt=""
        className="w-6 h-6 rounded-full shrink-0"
        loading="lazy"
      />
    );
  }

  return (
    <span className="w-6 h-6 rounded-full shrink-0 bg-muted/80 flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
      {(moniker || address).charAt(0).toUpperCase()}
    </span>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span className="text-accent font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function useSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { data, isLoading } = useApi<{ data: SearchResult[] }>("/search");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 80);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (!debouncedQuery || !data?.data) return [];
    const q = debouncedQuery.toLowerCase();

    const scored: Array<{ result: SearchResult; score: number }> = [];
    for (const r of data.data) {
      const name = r.name.toLowerCase();
      const moniker = r.moniker.toLowerCase();

      let score = 0;
      if (name === q || moniker === q) score = 4;
      else if (name.startsWith(q) || moniker.startsWith(q)) score = 3;
      else if (name.includes(q) || moniker.includes(q)) score = 1;

      if (score > 0) scored.push({ result: r, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 12).map((s) => s.result);
  }, [debouncedQuery, data]);

  const grouped = useMemo(() => {
    const chains = results.filter((r) => r.type === "spec");
    const providers = results.filter((r) => r.type === "provider");
    return { chains, providers };
  }, [results]);

  const flatResults = useMemo(
    () => [...grouped.chains, ...grouped.providers],
    [grouped],
  );

  return { query, setQuery, debouncedQuery, results, grouped, flatResults, isLoading: !data || isLoading };
}

function SearchResults({
  grouped,
  flatResults,
  debouncedQuery,
  isLoading,
  activeIndex,
  setActiveIndex,
  onNavigate,
}: {
  grouped: { chains: SearchResult[]; providers: SearchResult[] };
  flatResults: SearchResult[];
  debouncedQuery: string;
  isLoading: boolean;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onNavigate: (r: SearchResult) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        <span>Searching...</span>
      </div>
    );
  }

  if (flatResults.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No results for &ldquo;{debouncedQuery}&rdquo;
      </div>
    );
  }

  return (
    <div className="py-1">
      {grouped.chains.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Chains</span>
          </div>
          {grouped.chains.map((r) => {
            const idx = flatResults.indexOf(r);
            return (
              <button
                key={r.id}
                onClick={() => onNavigate(r)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full px-3 py-2 text-left flex items-center gap-3 text-sm transition-colors rounded-lg ${
                  idx === activeIndex ? "bg-muted/70" : "hover:bg-muted/40"
                }`}
                style={{ width: "calc(100% - 8px)", marginLeft: 4 }}
              >
                <ChainIcon specId={r.name} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-foreground truncate">
                    <HighlightMatch text={r.moniker || r.name} query={debouncedQuery} />
                  </span>
                  {r.moniker && (
                    <span className="text-xs text-muted-foreground truncate">
                      <HighlightMatch text={r.name} query={debouncedQuery} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </>
      )}

      {grouped.chains.length > 0 && grouped.providers.length > 0 && (
        <div className="mx-3 my-1 border-t border-border/50" />
      )}

      {grouped.providers.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Providers</span>
          </div>
          {grouped.providers.map((r) => {
            const idx = flatResults.indexOf(r);
            return (
              <button
                key={r.id}
                onClick={() => onNavigate(r)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full px-3 py-2 text-left flex items-center gap-3 text-sm transition-colors rounded-lg ${
                  idx === activeIndex ? "bg-muted/70" : "hover:bg-muted/40"
                }`}
                style={{ width: "calc(100% - 8px)", marginLeft: 4 }}
              >
                <ProviderIcon address={r.name} moniker={r.moniker} identity={r.identity} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-foreground truncate">
                    <HighlightMatch text={r.moniker || r.name.slice(0, 24) + "..."} query={debouncedQuery} />
                  </span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    <HighlightMatch text={r.name} query={debouncedQuery} />
                  </span>
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Desktop: inline input with dropdown */
function DesktopSearch() {
  const { query, setQuery, debouncedQuery, grouped, flatResults, isLoading } = useSearch();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setActiveIndex(-1), [flatResults]);

  const navigate = useCallback((r: SearchResult) => {
    router.push(r.link);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }, [router, setQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || flatResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < flatResults.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : flatResults.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const result = flatResults[activeIndex];
      if (result) navigate(result);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }, [open, flatResults, activeIndex, navigate]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const showDropdown = open && debouncedQuery.length > 0;

  return (
    <div ref={ref} className="relative hidden md:block">
      <div className={`flex items-center rounded-lg px-3 py-1.5 gap-2 transition-all duration-200 ${
        open
          ? "bg-muted/50 border border-accent/40 shadow-sm shadow-accent/5"
          : "bg-muted/30 border border-border hover:border-border/80"
      }`}>
        {showDropdown && isLoading
          ? <Loader2 size={14} className="text-accent shrink-0 animate-spin" />
          : <Search size={14} className={`shrink-0 transition-colors ${open ? "text-accent" : "text-muted-foreground"}`} />
        }
        <input
          ref={inputRef}
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="bg-transparent text-sm text-foreground outline-none w-44 placeholder:text-muted-foreground"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            className="text-muted-foreground hover:text-foreground text-xs shrink-0"
          >
            &times;
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 w-80 right-0 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto overflow-x-hidden">
          <SearchResults
            grouped={grouped}
            flatResults={flatResults}
            debouncedQuery={debouncedQuery}
            isLoading={isLoading}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            onNavigate={navigate}
          />
        </div>
      )}
    </div>
  );
}

/** Mobile: icon button that opens a full-screen overlay */
function MobileSearch() {
  const { query, setQuery, debouncedQuery, grouped, flatResults, isLoading } = useSearch();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setActiveIndex(-1), [flatResults]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const navigate = useCallback((r: SearchResult) => {
    router.push(r.link);
    setQuery("");
    setOpen(false);
  }, [router, setQuery]);

  const close = useCallback(() => {
    setQuery("");
    setOpen(false);
  }, [setQuery]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="p-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Search"
      >
        <Search size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          {/* Search header */}
          <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search providers, chains..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent text-base text-foreground outline-none flex-1 placeholder:text-muted-foreground"
            />
            <button
              onClick={close}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {debouncedQuery.length > 0 ? (
              <SearchResults
                grouped={grouped}
                flatResults={flatResults}
                debouncedQuery={debouncedQuery}
                isLoading={isLoading}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                onNavigate={navigate}
              />
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Start typing to search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchBar() {
  return (
    <>
      <MobileSearch />
      <DesktopSearch />
    </>
  );
}
