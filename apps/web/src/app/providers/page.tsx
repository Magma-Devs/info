"use client";

import { Suspense, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { formatNumber } from "@/lib/format";

interface Provider {
  provider: string;
  moniker: string;
  identity?: string;
  activeServices: number;
  totalStake: string;
  totalDelegation: string;
}

interface ProvidersResponse {
  data: Provider[];
  pagination: { total: number };
}

interface IndexStats {
  totalCu: string;
  totalRelays: string;
  totalStake: string;
  activeProviderCount: number;
}

function fmtLava(ulava: string): string {
  try {
    return Number(BigInt(ulava) / BigInt(1e6)).toLocaleString("en-US");
  } catch {
    return "0";
  }
}

function toBigInt(v: string | undefined): bigint {
  try { return BigInt(v ?? "0"); } catch { return 0n; }
}

const columns: ColumnDef<Provider, unknown>[] = [
  {
    id: "moniker",
    header: "Moniker",
    accessorFn: (row) => row.moniker || row.provider,
    cell: ({ row }) => (
      <ProviderLink
        address={row.original.provider}
        moniker={row.original.moniker}
        identity={row.original.identity}
        showAvatar
      />
    ),
  },
  {
    id: "address",
    header: "Provider Address",
    accessorFn: (row) => row.provider,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.provider.slice(0, 20)}...
      </span>
    ),
  },
  {
    id: "totalStake",
    header: "Total Stake",
    accessorFn: (row) => Number(toBigInt(row.totalStake) + toBigInt(row.totalDelegation)),
    cell: ({ row }) => (
      <LavaAmount
        amount={(toBigInt(row.original.totalStake) + toBigInt(row.original.totalDelegation)).toString()}
      />
    ),
  },
];

function ProvidersContent() {
  const { data: stats } = useApi<IndexStats>("/index/stats");
  const { data: resp, isLoading } = useApi<ProvidersResponse>("/providers?limit=10000");
  const providers = useMemo(() => resp?.data ?? [], [resp]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "totalStake", desc: true },
  ]);

  const table = useReactTable({
    data: providers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Relays" value={formatNumber(stats?.totalRelays ?? 0)} />
        <StatCard label="Total CU" value={formatNumber(stats?.totalCu ?? 0)} />
        <StatCard label="Total Stake" value={`${fmtLava(stats?.totalStake ?? "0")} LAVA`} />
        <StatCard label="Active Providers" value={stats?.activeProviderCount ?? 0} />
      </div>

      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">
            Active Providers ({providers.length})
          </h2>
        </div>
        <div className="p-4">
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
                          className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
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
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                {" "}({providers.length} providers)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                  className="px-3 py-1 rounded border border-border disabled:opacity-30 hover:bg-muted"
                >
                  Previous
                </button>
                <button
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                  className="px-3 py-1 rounded border border-border disabled:opacity-30 hover:bg-muted"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProvidersContent />
    </Suspense>
  );
}
