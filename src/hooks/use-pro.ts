"use client";

import { useEffect, useState } from "react";

import { getProStatus, type ProStatus } from "@/lib/db";

/** Pro status saved on this phone, or null while loading. */
export function usePro() {
  const [status, setStatus] = useState<ProStatus | null>(null);
  useEffect(() => {
    let active = true;
    getProStatus().then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, []);
  return [status, setStatus] as const;
}
