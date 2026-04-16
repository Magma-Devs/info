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
import type { PaginatedResponse, ProviderListItem } from "@info/shared/types";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";

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

function ProvidersContent() {
const { data: resp, isLoading } = useApi<PaginatedResponse<ProviderListItem>>("/providers?limit=10000");
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
<div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">
            Active Providers ({providers.length})
          </h2>
        </div>
        <div className="p-4">
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm table-fixed">
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
                {table.getRowModel().rows.map((row) => (
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
