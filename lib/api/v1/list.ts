import type { ListQueryInput } from "./schemas";

/**
 * Cursor pagination for /api/v1 lists. Ordered by a time field then id, so a
 * cursor is stable while rows are being added; `updated_since` filters on the
 * same field. One extra row is fetched to answer `hasMore` honestly.
 */

export type PageArgs<F extends string> = {
  take: number;
  skip?: number;
  cursor?: { id: string };
  orderBy: Array<Record<F | "id", "asc" | "desc">>;
};

export function pageArgs<F extends string>(q: ListQueryInput, field: F): PageArgs<F> {
  return {
    take: q.limit + 1,
    ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    orderBy: [{ [field]: q.order } as Record<F | "id", "asc" | "desc">, { id: q.order } as Record<F | "id", "asc" | "desc">],
  };
}

/** `{ [field]: { gte } }` for `updated_since`, or `{}`. */
export function sinceFilter<F extends string>(q: ListQueryInput, field: F): Partial<Record<F, { gte: Date }>> {
  if (!q.updated_since) return {};
  return { [field]: { gte: new Date(q.updated_since) } } as Partial<Record<F, { gte: Date }>>;
}

export function page<T extends { id: string }, O>(
  rows: T[],
  q: ListQueryInput,
  map: (row: T) => O
): { data: O[]; meta: { nextCursor: string | null; hasMore: boolean; limit: number } } {
  const hasMore = rows.length > q.limit;
  const slice = hasMore ? rows.slice(0, q.limit) : rows;
  return {
    data: slice.map(map),
    meta: { nextCursor: hasMore ? (slice[slice.length - 1]?.id ?? null) : null, hasMore, limit: q.limit },
  };
}
