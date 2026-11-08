"use client";

import { useEffect, useState } from "react";
import { SIGNALING_HTTP_URL } from "@/lib/config";

/** Live "N online" pill. `count` may be passed in by a page that already has a socket. */
export default function OnlineCount({ count, className = "" }: { count?: number | null; className?: string }) {
  const [fetched, setFetched] = useState<number | null>(null);
  const [down, setDown] = useState(false);
  const external = count !== undefined;

  useEffect(() => {
    if (external) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${SIGNALING_HTTP_URL}/stats`, { cache: "no-store" });
        const data = await res.json();
        if (alive) {
          setFetched(typeof data.online === "number" ? data.online : null);
          setDown(false);
        }
      } catch {
        if (alive) setDown(true);
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [external]);

  const value = external ? count : fetched;
  const offline = !external && down;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 font-mono text-[12px] text-muted ${className}`}
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {!offline && <span className="ping-soft absolute inset-0 rounded-full bg-lime" />}
        <span className={`relative size-2 rounded-full ${offline ? "bg-danger" : "bg-lime"}`} />
      </span>
      {offline ? (
        "Server offline"
      ) : value === null || value === undefined ? (
        "Counting…"
      ) : (
        <span>
          <span className="text-ink tabular-nums">{value.toLocaleString("en-US")}</span> online
        </span>
      )}
    </span>
  );
}
