"use client";

import { useMemo, useState } from "react";
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
import { useApi } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainLink } from "@/components/data/ChainLink";
import { formatNumberKMB } from "@/lib/format";
import { getChainIcon } from "@/lib/chain-icons";

interface Spec { specId: string; name: string; providerCount: number; relays30d: string; cu30d: string; }

function toBigInt(v: string | undefined): bigint {
  try { return BigInt(v ?? "0"); } catch { return 0n; }
}

const columns: ColumnDef<Spec, unknown>[] = [
  {
    id: "specId",
    header: "Chain ID",
    accessorFn: (row) => row.specId,
    cell: ({ row }) => <ChainLink chainId={row.original.specId} />,
  },
  {
    id: "name",
    header: "Chain Name",
    accessorFn: (row) => row.name,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.name}</span>,
  },
  {
    id: "providerCount",
    header: "Providers",
    accessorFn: (row) => row.providerCount,
  },
  {
    id: "relays30d",
    header: "Relays (30d)",
    meta: { hideOnMobile: true },
    accessorFn: (row) => Number(toBigInt(row.relays30d)),
    cell: ({ row }) => formatNumberKMB(row.original.relays30d),
  },
  {
    id: "cu30d",
    header: "CU (30d)",
    meta: { hideOnMobile: true },
    accessorFn: (row) => Number(toBigInt(row.cu30d)),
    cell: ({ row }) => formatNumberKMB(row.original.cu30d),
  },
];

function ChainIconImg({ chainId }: { chainId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="w-9 h-9 rounded-md shrink-0 bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
        {chainId.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={getChainIcon(chainId)}
      alt=""
      className="w-9 h-9 rounded-md shrink-0"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function ChainsPage() {
  const { data: specsResp, isLoading, error } = useApi<{ data: Spec[] }>("/specs");
  const specs = useMemo(() => specsResp?.data ?? [], [specsResp]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "relays30d", desc: true },
  ]);

  // Mobile: pre-sorted by relays (30d) desc
  const mobileList = useMemo(
    () => [...specs].sort((a, b) => {
      const av = toBigInt(a.relays30d);
      const bv = toBigInt(b.relays30d);
      return av > bv ? -1 : av < bv ? 1 : 0;
    }),
    [specs],
  );

  const table = useReactTable({
    data: specs,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (error) return <div className="py-12 text-center text-destructive">Failed to load chains data.</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-4 md:p-6 border-b border-border">
          <h2 className="text-lg font-semibold">
            Active Chains {isLoading ? "" : `(${specs.length})`}
          </h2>
        </div>

        {/* Mobile: compact card list */}
        <ul className="md:hidden divide-y divide-border/60">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <li key={`skel-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="w-9 h-9 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </li>
              ))
            : mobileList.map((s) => {
            const hasFullName = s.name && s.name !== s.specId;
            return (
              <li key={s.specId}>
                <Link href={`/chain/${s.specId}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/60 transition-colors">
                  <ChainIconImg chainId={s.specId} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-accent truncate">{hasFullName ? s.name : s.specId}</div>
                    {hasFullName && <div className="text-[11px] text-muted-foreground truncate">{s.specId}</div>}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {s.providerCount} providers
                      {s.cu30d && ` · ${formatNumberKMB(s.cu30d)} CU (30d)`}
                    </div>
                  </div>
                  <div className="text-sm font-medium shrink-0 text-right">
                    {formatNumberKMB(s.relays30d)}
                    <div className="text-[11px] text-muted-foreground font-normal">relays (30d)</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop: table */}
        <div className="hidden md:block p-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-card">
                    {hg.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          className={`px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground${
                            (header.column.columnDef.meta as Record<string, boolean> | undefined)?.hideOnMobile ? " hidden md:table-cell" : ""
                          }`}
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
                          <td key={j} className={`px-4 py-3${
                            (col.meta as Record<string, boolean> | undefined)?.hideOnMobile ? " hidden md:table-cell" : ""
                          }`}>
                            <Skeleton className="h-4 w-full max-w-[140px]" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className={`px-4 py-3 text-foreground${
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
