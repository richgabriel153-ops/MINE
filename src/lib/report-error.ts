"use client";

import { isNetworkError } from "./offline-cache";

const sent = new Set<string>();
let count = 0;

/** Tell the server something broke (once per problem, at most 10 per visit). Never throws. */
export function reportError(error: unknown, kind = "error"): void {
  try {
    if (typeof window === "undefined" || count >= 10) return;
    // "No internet" isn't a bug, and the report couldn't be sent anyway.
    if (isNetworkError(error)) return;
    const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
    const key = `${kind}:${e.message}`;
    if (sent.has(key)) return;
    sent.add(key);
    count += 1;
    const body = JSON.stringify({
      kind,
      message: e.message || "Unknown error",
      page: window.location.pathname,
      digest: (e as Error & { digest?: string }).digest ?? "",
      trace: (e.stack ?? "").split("\n").slice(0, 8).join("\n"),
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
    });
    void send(body);
  } catch {
    // reporting must never break the app
  }
}

async function send(body: string) {
  let token: string | null = null;
  try {
    const { accessToken } = await import("./cloud/client");
    token = await accessToken();
  } catch {
    // not signed in, or accounts not set up
  }
  await fetch("/api/log-error", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  }).catch(() => {});
}
