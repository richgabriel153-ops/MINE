"use client";

import { useEffect, useState } from "react";

export interface PreviewMode {
  enabled: boolean;
  assistantReady: boolean;
}

let cached: Promise<PreviewMode> | null = null;

/** Asks the server once whether this is a preview link with the Pro preview available. */
export function fetchPreviewMode(): Promise<PreviewMode> {
  cached ??= fetch("/api/demo", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<PreviewMode>) : { enabled: false, assistantReady: false }))
    .catch(() => ({ enabled: false, assistantReady: false }));
  return cached;
}

export function usePreviewMode(): PreviewMode | null {
  const [mode, setMode] = useState<PreviewMode | null>(null);
  useEffect(() => {
    let active = true;
    fetchPreviewMode().then((m) => active && setMode(m));
    return () => {
      active = false;
    };
  }, []);
  return mode;
}
