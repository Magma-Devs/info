"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { ProviderListItem } from "@info/shared/types";
import { useApi } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { formatNumberKMB } from "@/lib/format";

function toBigInt(v: string | null | undefined): bigint {
  try { return BigInt(v ?? "0"); } catch { return 0n; }
}

const columns: ColumnDef<ProviderListItem, unknown>[] = [
  {
    id: "moniker",
    header: "Moniker",
    size: 200,
    accessorFn: (row) => row.moniker || row.provider,
    cell: ({ row }) => (
      <div className="min-w-0">
        <ProviderLink
          address={row.original.provider}
          moniker={row.original.moniker}
          identity={row.original.identity}
          showAvatar
        />
      </div>
    ),
  },
  {
    id: "address",
    header: "Provider Address",
    accessorFn: (row) => row.provider,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground block truncate">
        {row.original.provider}
      </span>
    ),
  },
  {
    id: "totalStake",
    header: "Total Stake",
    size: 160,
    meta: { hideOnMobile: true },
    accessorFn: (row) => Number(toBigInt(row.totalStake) + toBigInt(row.totalDelegation)),
    cell: ({ row }) => (
      <LavaAmount
        amount={(toBigInt(row.original.totalStake) + toBigInt(row.original.totalDelegation)).toString()}
      />
    ),
  },
];

function ProviderAvatarImg({ address, moniker, identity }: { address: string; moniker?: string; identity?: string }) {
  const avatarUrl = identity ? `/providers/${address}/avatar?identity=${identity}` : null;
  const { data: avatarResp } = useApi<{ url: string | null }>(avatarUrl);
  if (avatarResp?.url) {
    return <img src={avatarResp.url} alt="" className="w-11 h-11 rounded-full shrink-0" loading="lazy" />;
  }
  return (
    <span className="w-11 h-11 rounded-full shrink-0 bg-muted flex items-center justify-center text-base font-medium text-muted-foreground">
      {(moniker || address).charAt(0).toUpperCase()}
    </span>
  );
}

function ProvidersContent() {
  const { data: resp, isLoading } = useApi<{ data: ProviderListItem[] }>("/providers?limit=10000");
  const providers = useMemo(() => resp?.data ?? [], [resp]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "totalStake", desc: true },
  ]);

  // Mobile: pre-sorted by total stake desc (API already returns it that way)
  const mobileList = useMemo(
    () => [...providers].sort((a, b) => {
      const av = toBigInt(a.totalStake) + toBigInt(a.totalDelegation);
      const bv = toBigInt(b.totalStake) + toBigInt(b.totalDelegation);
      return av > bv ? -1 : av < bv ? 1 : 0;
    }),
    [providers],
  );

  const table = useReactTable({
    data: providers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-4 md:p-6 border-b border-border">
          <h2 className="text-lg font-semibold">
            Active Providers {isLoading ? "" : `(${providers.length})`}
          </h2>
        </div>

        {/* Mobile: compact card list */}
        <ul className="md:hidden divide-y divide-border/60">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <li key={`skel-${i}`} className="flex items-center gap-4 px-4 py-5">
                  <Skeleton className="w-11 h-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24 shrink-0" />
                </li>
              ))
            : mobileList.map((p) => {
            const total = toBigInt(p.totalStake) + toBigInt(p.totalDelegation);
            const label = p.moniker || `${p.provider.slice(0, 12)}...`;
            return (
              <li key={p.provider}>
                <Link href={`/provider/${p.provider}`} className="flex items-center gap-4 px-4 py-5 active:bg-muted/40 transition-colors">
                  <ProviderAvatarImg address={p.provider} moniker={p.moniker} identity={p.identity} />
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold text-accent truncate">{label}</div>
                    {p.moniker && <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">{p.provider}</div>}
                    <div className="text-sm text-muted-foreground mt-1.5">
                      {p.activeServices} services
                      {p.relaySum30d && ` · ${formatNumberKMB(p.relaySum30d)} relays (30d)`}
                    </div>
                  </div>
                  <div className="text-base font-medium shrink-0">
                    <LavaAmount amount={total.toString()} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop: table */}
        <div className="hidden md:block p-4">
          <div className="rounded-lg border border-border">
            <table className="w-full text-base table-fixed">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-card">
                    {hg.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          className={`px-4 py-4 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground${
                            (header.column.columnDef.meta as Record<string, boolean> | undefined)?.hideOnMobile ? " hidden md:table-cell" : ""
                          }`}
                          style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ChevronUp size={14} />
                            ) : sorted === "desc" ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronsUpDown size={14} className="opacity-30" />
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`skel-${i}`} className="border-b border-border/50">
                        {columns.map((col, j) => (
                          <td key={j} className={`px-4 py-4${
                            (col.meta as Record<string, boolean> | undefined)?.hideOnMobile ? " hidden md:table-cell" : ""
                          }`}>
                            <Skeleton className="h-4 w-full max-w-[160px]" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className={`px-4 py-4 text-foreground${
                            (cell.column.columnDef.meta as Record<string, boolean> | undefined)?.hideOnMobile ? " hidden md:table-cell" : ""
                          }`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={null}>
      <ProvidersContent />
    </Suspense>
  );
}
