"use client";

import { useEffect } from "react";

/** Registers the offline service worker (production only) and refreshes saved pages after load. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const ready = await navigator.serviceWorker.ready;
        if (navigator.onLine) (reg.active ?? ready.active)?.postMessage("warm");
      } catch {
        // The app still works online without it.
      }
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
