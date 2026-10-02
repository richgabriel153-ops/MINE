"use client";

import { useCallback, useEffect, useState } from "react";

import { listDocuments } from "@/lib/db";
import type { DocumentRecord } from "@/lib/types";

/** All saved documents, newest first (null while loading). */
export function useDocuments() {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null);
  const reload = useCallback(async () => setDocs(await listDocuments()), []);
  useEffect(() => {
    let active = true;
    listDocuments().then((d) => {
      if (active) setDocs(d);
    });
    return () => {
      active = false;
    };
  }, []);
  return { docs, reload };
}
