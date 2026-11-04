"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listDocumentsPage, type DocumentPageQuery } from "@/lib/db";
import type { DocumentRecord } from "@/lib/types";

export const PAGE_SIZE = 30;

/**
 * Documents a page at a time, filtered and searched by the database.
 * `max`: stop after this many (the free plan shows the latest 50).
 */
export function usePagedDocuments(filter: Omit<DocumentPageQuery, "offset" | "limit">, max = Infinity) {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filter);
  const request = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const limit = Math.min(PAGE_SIZE, Math.max(0, max - offset));
      if (limit === 0) return;
      const page = await listDocumentsPage({ ...(JSON.parse(key) as typeof filter), offset, limit });
      if (id !== request.current) return; // a newer search replaced this one
      setDocs((prev) => (offset === 0 ? page.docs : [...(prev ?? []), ...page.docs]));
      setHasMore(page.hasMore && offset + page.docs.length < max);
      setError(null);
    },
    [key, max],
  );

  useEffect(() => {
    // Wait a moment while someone is typing a search.
    const t = setTimeout(() => {
      load(0).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load your records."));
    }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      await load(docs?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [load, docs]);

  const reload = useCallback(() => load(0).catch(() => {}), [load]);

  return { docs, hasMore, loadMore, loadingMore, error, reload };
}
