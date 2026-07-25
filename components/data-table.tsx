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
  type PaginationState,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * The one table in the app. Everything that lists rows goes through here so
 * search, sorting, paging, the scroll viewport and the mobile card fallback
 * behave identically everywhere.
 *
 * Notes on the two things that were wrong before:
 *  - Search filtered a single named column, so "Search by email…" on the users
 *    table could not find a person by name. It is a global filter now.
 *  - Paging state was never reconciled with the rows. Filtering while on page 3,
 *    or deleting the last row of the last page, left the viewer on a page that
 *    no longer exists — an empty table that looks like "no results".
 */

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Case-insensitive substring match over the stringified cell value. */
function globalTextFilter<TData>(row: Row<TData>, columnId: string, filterValue: unknown): boolean {
  const needle = String(filterValue).trim().toLowerCase();
  if (!needle) return true;
  const value = row.getValue(columnId);
  if (value == null) return false;
  return String(value).toLowerCase().includes(needle);
}

/** Clicks on a control inside a row belong to that control, not to the row link. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest("a,button,input,select,textarea,label,[role='button'],[role='checkbox']")
  );
}

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  rowHref?: (row: TData) => string | null;
  /** Shown when there are no rows. Defaults to a branded EmptyState. */
  empty?: ReactNode;
  /** Shown instead of `empty` when a search is active and matched nothing. */
  emptyFiltered?: ReactNode;
  searchPlaceholder?: string;
  /** Set false to hide the search field (e.g. a short fixed list). */
  searchable?: boolean;
  /** Extra controls rendered to the right of the search field. */
  toolbar?: ReactNode;
  initialPageSize?: number;
  /**
   * CSS max-height of the scroll viewport. The header sticks to its top, so a
   * long table scrolls inside the card instead of pushing the pager off-screen.
   */
  maxHeight?: string;
  className?: string;
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
  emptyFiltered,
  searchPlaceholder = "Search…",
  searchable = true,
  toolbar,
  initialPageSize = 25,
  maxHeight = "min(65vh, 40rem)",
  className,
}: DataTableProps<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [query, setQuery] = useState("");
  // Typing stays responsive on big client-side tables (activity logs, learners):
  // the keystroke paints immediately and the re-filter runs at low priority.
  const deferredQuery = useDeferredValue(query);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter: deferredQuery },
    onSortingChange: (next) => {
      setSorting(next);
      setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    onGlobalFilterChange: setQuery,
    globalFilterFn: globalTextFilter,
    // Search every accessor column, not just the string-valued ones TanStack
    // opts in by default — counts and dates are things people search for too.
    getColumnCanGlobalFilter: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Paging is reconciled below instead: the built-in reset does not fire for
    // a fully controlled filter, and it never handles rows disappearing.
    autoResetPageIndex: false,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const pageCount = table.getPageCount();
  const isFiltering = deferredQuery.trim().length > 0;

  // Reset to the first page when the search changes, and pull back to the last
  // real page when the row count shrinks. Adjusted during render rather than in
  // an effect so no frame ever paints a page that does not exist.
  const [lastQuery, setLastQuery] = useState(deferredQuery);
  if (lastQuery !== deferredQuery) {
    setLastQuery(deferredQuery);
    if (pagination.pageIndex !== 0) setPagination((p) => ({ ...p, pageIndex: 0 }));
  } else if (pagination.pageIndex > 0 && pagination.pageIndex > pageCount - 1) {
    setPagination((p) => ({ ...p, pageIndex: Math.max(0, pageCount - 1) }));
  }

  const rows = table.getRowModel().rows;
  const firstRowNumber = filteredCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRowNumber = Math.min(filteredCount, firstRowNumber + rows.length - 1);
  const emptyContent = isFiltering ? (emptyFiltered ?? empty) : empty;
  const leafColumnCount = table.getVisibleLeafColumns().length;

  function go(href: string | null) {
    if (href) router.push(href);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {searchable || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative min-w-48 flex-1 sm:max-w-xs sm:flex-none">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                /* Not type="search": Chrome's native clear affordance would sit
                   next to the themed one below. */
                type="text"
                className="h-11 w-full rounded-[10px] border-2 border-border bg-card pl-9 pr-9 text-[16px] font-medium text-card-foreground shadow-sm outline-none placeholder:font-normal placeholder:text-muted-foreground focus:-translate-x-px focus:-translate-y-px focus:shadow-md"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon name="x" className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}

      {/* Mobile: cards. Same page slice as the table, same scroll viewport. */}
      <div
        className="flex flex-col gap-2 overflow-y-auto [scrollbar-gutter:stable] md:hidden"
        style={{ maxHeight }}
      >
        {rows.length === 0 ? (
          <div className="rounded-[14px] border-2 border-border bg-card px-4 py-6 text-center text-sm font-medium text-muted-foreground shadow-md">
            {emptyContent}
          </div>
        ) : (
          rows.map((row) => {
            const href = rowHref ? rowHref(row.original) : null;
            const cells = row.getVisibleCells();
            const primary = cells[0];
            const secondary = cells.slice(1, 3);
            return (
              <div
                key={row.id}
                role={href ? "link" : undefined}
                tabIndex={href ? 0 : undefined}
                onClick={(e) => {
                  if (!isInteractiveTarget(e.target)) go(href);
                }}
                onKeyDown={(e) => {
                  if (href && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    go(href);
                  }
                }}
                className={cn(
                  "rounded-[14px] border-2 border-border bg-card p-4 text-left shadow-md",
                  href &&
                    "cursor-pointer hover:bg-accent focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                )}
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
              </div>
            );
          })
        )}
      </div>

      <div
        className="hidden overflow-auto rounded-[14px] border-2 border-border bg-card shadow-md [scrollbar-gutter:stable] md:block"
        style={{ maxHeight }}
      >
        <table className="w-full text-left text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      /* Sticky header: the bottom rule is a pseudo-element because a
                         real border on a sticky cell drops out under border-collapse. */
                      className="sticky top-0 z-10 select-none bg-muted p-0 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border"
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="flex w-full items-center gap-1 px-4 py-3 text-left uppercase outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Icon
                            name={sorted === "asc" ? "chevron-up" : "chevron-down"}
                            className={cn("size-3.5 shrink-0", sorted ? "opacity-100" : "opacity-25")}
                          />
                        </button>
                      ) : (
                        <div className="px-4 py-3">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center font-medium text-muted-foreground" colSpan={leafColumnCount}>
                  {emptyContent}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = rowHref ? rowHref(row.original) : null;
                return (
                  <tr
                    key={row.id}
                    tabIndex={href ? 0 : undefined}
                    onClick={(e) => {
                      if (!isInteractiveTarget(e.target)) go(href);
                    }}
                    onKeyDown={(e) => {
                      if (href && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        go(href);
                      }
                    }}
                    className={cn(
                      "border-t-2 border-dashed border-border font-medium",
                      href &&
                        "cursor-pointer hover:bg-accent focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
                    )}
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-muted-foreground">
        <div className="num" aria-live="polite">
          {filteredCount === 0
            ? "No rows"
            : `${firstRowNumber}–${lastRowNumber} of ${filteredCount}`}
          {isFiltering && filteredCount !== totalCount ? ` (filtered from ${totalCount})` : ""}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totalCount > PAGE_SIZE_OPTIONS[0] ? (
            <label className="flex items-center gap-1.5">
              <span className="sr-only sm:not-sr-only">Rows</span>
              <select
                className="h-9 rounded-[10px] border-2 border-border bg-card px-2 text-xs font-bold text-card-foreground shadow-sm outline-none"
                aria-label="Rows per page"
                value={pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {pageCount > 1 ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="First page"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <Icon name="arrow-left" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <span className="num px-1">
                {pagination.pageIndex + 1} / {pageCount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Last page"
                onClick={() => table.setPageIndex(pageCount - 1)}
                disabled={!table.getCanNextPage()}
              >
                <Icon name="arrow-right" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
