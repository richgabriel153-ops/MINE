"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/report-error";

/** Reports crashes that happen outside a screen (e.g. in a button handler) so they can be fixed. */
export function ErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, "uncaught");
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, "unhandled-promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
