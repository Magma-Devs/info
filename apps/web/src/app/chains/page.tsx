"use client";

import { useMemo, useState } from "react";
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
import { Loading } from "@/components/data/Loading";
import { ChainLink } from "@/components/data/ChainLink";
import { formatNumberKMB } from "@/lib/format";

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

export default function ChainsPage() {
  const { data: specsResp, isLoading } = useApi<{ data: Spec[] }>("/specs");
  const specs = useMemo(() => specsResp?.data ?? [], [specsResp]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "relays30d", desc: true },
  ]);

  const table = useReactTable({
    data: specs,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
<div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">
            Active Chains ({specs.length})
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
        </div>
      </div>
    </div>
  );
}
