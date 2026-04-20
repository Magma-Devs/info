"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Row,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SortableTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  defaultSort?: SortingState;
  pageSize?: number;
  renderSubRow?: (row: Row<T>) => ReactNode;
  /** When true, render skeleton rows instead of data */
  loading?: boolean;
  /** Number of skeleton rows to render when loading (default 5) */
  loadingRows?: number;
}

/**
 * Client-side sortable table with optional pagination and expandable sub-rows.
 * All columns are sortable by clicking the header.
 */
export function SortableTable<T>({
  data,
  columns,
  defaultSort = [],
  pageSize,
  renderSubRow,
  loading,
  loadingRows = 5,
}: SortableTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(renderSubRow ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    ...(pageSize
      ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } }
      : {}),
  });

  if (!loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div>
      <div>
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
                      }${
                        (header.column.columnDef.meta as Record<string, boolean> | undefined)?.mobileOnly ? " md:hidden" : ""
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
            {loading
              ? Array.from({ length: loadingRows }).map((_, rowIdx) => (
                  <tr key={`skeleton-${rowIdx}`}>
                    {table.getAllColumns().map((col) => {
                      const meta = col.columnDef.meta as Record<string, boolean> | undefined;
                      return (
                        <td key={col.id} className={`px-4 py-3${
                          rowIdx > 0 ? " border-t border-border/15" : ""
                        }${meta?.hideOnMobile ? " hidden md:table-cell" : ""}${
                          meta?.mobileOnly ? " md:hidden" : ""
                        }`}>
                          <Skeleton className="h-4 w-full max-w-[140px]" />
                        </td>
                      );
                    })}
                  </tr>
                ))
              : table.getRowModel().rows.map((row, rowIdx) => (
                  <Fragment key={row.id}>
                    <tr className="transition-colors md:hover:bg-muted/20 active:bg-muted/30">
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as Record<string, boolean> | undefined;
                        return (
                          <td key={cell.id} className={`px-4 py-3 text-foreground${
                            rowIdx > 0 ? " border-t border-border/15" : ""
                          }${meta?.hideOnMobile ? " hidden md:table-cell" : ""}${
                            meta?.mobileOnly ? " md:hidden" : ""
                          }`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                    {renderSubRow && row.getIsExpanded() && (
                      <tr key={`${row.id}-sub`} className="bg-muted/15">
                        <td colSpan={row.getVisibleCells().length} className="px-4 py-3">
                          {renderSubRow(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
          </tbody>
        </table>
      </div>

      {pageSize && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between mt-4 px-4 pb-4 text-sm text-muted-foreground">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {" "}({data.length} total)
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
  );
}
