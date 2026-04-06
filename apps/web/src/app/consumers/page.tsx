"use client";

import { Suspense } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { usePaginatedApi } from "@/hooks/use-paginated-api";
import { Loading } from "@/components/data/Loading";
import { DataTable } from "@/components/data/DataTable";
import Link from "next/link";

interface Consumer {
  consumer: string;
  totalCu: string;
  totalRelays: string;
  plan?: string;
}

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

const columns: ColumnDef<Consumer, unknown>[] = [
  {
    id: "consumer",
    header: "Consumer",
    cell: ({ row }) => (
      <Link href={`/consumer/${row.original.consumer}`} className="text-accent hover:underline font-mono text-xs">
        {row.original.consumer?.slice(0, 30)}...
      </Link>
    ),
  },
  {
    id: "plan",
    header: "Plan",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.plan || "—"}</span>,
  },
  {
    id: "totalCu",
    header: "Total CU",
    cell: ({ row }) => <span className="text-muted-foreground">{fmt(row.original.totalCu)}</span>,
  },
  {
    id: "totalRelays",
    header: "Total Relays",
    cell: ({ row }) => <span className="text-muted-foreground">{fmt(row.original.totalRelays)}</span>,
  },
];

function ConsumersContent() {
  const { data: consumers, pagination, setPage, setSort, sort, order, isLoading } = usePaginatedApi<Consumer>("/consumers");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Consumers ({pagination.total})</h2>
        </div>
        <div className="p-4">
          <DataTable
            data={consumers}
            columns={columns}
            pagination={pagination}
            sort={sort}
            order={order}
            onSort={setSort}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

export default function ConsumersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ConsumersContent />
    </Suspense>
  );
}
