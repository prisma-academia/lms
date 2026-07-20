"use client";

/* eslint-disable react-hooks/incompatible-library */

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  rowHref?: (row: TData) => string | null;
  /** Shown when there are no rows. Defaults to a branded EmptyState. */
  empty?: ReactNode;
  searchPlaceholder?: string;
  filterColumnId?: string;
};

export function DataTable<TData>({
  columns,
  data,
  rowHref,
  empty = (
    <EmptyState icon="search" title="Nothing here yet">
      No results.
    </EmptyState>
  ),
  searchPlaceholder = "Search…",
  filterColumnId,
}: DataTableProps<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="flex flex-col gap-3">
      {filterColumnId ? (
        <input
          type="text"
          className="h-11 w-full max-w-xs rounded-[10px] border-2 border-border bg-card px-3 text-[16px] font-medium text-card-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:-translate-x-px focus:-translate-y-px focus:shadow-md"
          placeholder={searchPlaceholder}
          value={(table.getColumn(filterColumnId)?.getFilterValue() as string) ?? ""}
          onChange={(e) => table.getColumn(filterColumnId)?.setFilterValue(e.target.value)}
        />
      ) : null}
      <div className="flex flex-col gap-2 md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <div className="rounded-[14px] border-2 border-border bg-card px-4 py-6 text-center text-sm font-medium text-muted-foreground shadow-md">
            {empty}
          </div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const href = rowHref ? rowHref(row.original) : null;
            const cells = row.getVisibleCells();
            const primary = cells[0];
            const secondary = cells.slice(1, 3);
            return (
              <button
                key={row.id}
                type="button"
                disabled={!href}
                onClick={() => {
                  if (href) router.push(href);
                }}
                className={`rounded-[14px] border-2 border-border bg-card p-4 text-left shadow-md ${href ? "cursor-pointer hover:bg-accent" : ""}`}
              >
                <div className="text-sm font-bold">
                  {primary ? flexRender(primary.column.columnDef.cell, primary.getContext()) : null}
                </div>
                {secondary.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                    {secondary.map((c) => (
                      <div key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</div>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-[14px] border-2 border-border bg-card shadow-md [scrollbar-gutter:stable] md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b-2 border-border bg-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="select-none px-4 py-3"
                    onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                    style={{ cursor: h.column.getCanSort() ? "pointer" : "default" }}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ▲" : h.column.getIsSorted() === "desc" ? " ▼" : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center font-medium text-muted-foreground" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const href = rowHref ? rowHref(row.original) : null;
                return (
                  <tr
                    key={row.id}
                    className={`border-t-2 border-dashed border-border font-medium ${href ? "cursor-pointer hover:bg-accent" : ""}`}
                    onClick={() => {
                      if (href) router.push(href);
                    }}
                  >
                    {row.getVisibleCells().map((c) => (
                      <td key={c.id} className="px-4 py-3">
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
        <div>
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
