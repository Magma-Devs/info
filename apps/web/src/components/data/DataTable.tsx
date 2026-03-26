"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown, Download } from "lucide-react";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  sort?: string;
  order?: "asc" | "desc";
  onSort?: (column: string) => void;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  csvUrl?: string;
}

/**
 * THE one table component. Built on TanStack Table.
 * Replaces: StaticSortTable (512 lines), DynamicSortTable (277 lines), 11 page-level tables.
 */
export function DataTable<T>({
  data,
  columns,
  pagination,
  sort,
  order,
  onSort,
  onPageChange,
  isLoading,
  csvUrl,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div>
      {csvUrl && (
        <div className="flex justify-end mb-2">
          <a
            href={csvUrl}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Download size={14} />
            CSV
          </a>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-card">
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  const isSorted = sort === columnId;
                  const canSort = onSort != null;

                  return (
                    <th
                      key={header.id}
                      className={`px-4 py-3 text-left font-medium text-muted-foreground ${canSort ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                      onClick={canSort ? () => onSort(columnId) : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          isSorted
                            ? order === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                            : <ChevronsUpDown size={14} className="opacity-30" />
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

      {pagination && pagination.pages > 1 && onPageChange && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {(pagination.page - 1) * pagination.limit + 1}-
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="px-3 py-1 rounded border border-border disabled:opacity-30 hover:bg-muted"
            >
              Previous
            </button>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="px-3 py-1 rounded border border-border disabled:opacity-30 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
