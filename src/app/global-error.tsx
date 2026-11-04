"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/report-error";

/** Last-resort screen if the whole app fails to start. It can't use the app's styles, so they're inline. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => reportError(error, "app"), [error]);
  const button = {
    display: "block",
    width: "100%",
    minHeight: 52,
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 700,
    marginTop: 10,
    cursor: "pointer",
  } as const;
  return (
    <html lang="en-NG">
      <body style={{ margin: 0, background: "#ffffff", color: "#0e1d1c", fontFamily: "system-ui, Roboto, Arial, sans-serif" }}>
        <title>Something went wrong · InCeipt</title>
        <main role="alert" style={{ maxWidth: 360, margin: "0 auto", padding: "25vh 16px 0", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Sorry, something went wrong</h1>
          <p style={{ color: "#4d5e5c", lineHeight: 1.5, margin: "0 0 16px" }}>
            Your records are safe. Try again, and if it keeps happening, check your internet connection.
          </p>
          <button type="button" onClick={retry} style={{ ...button, background: "#0b5f5a", color: "#ffffff", border: 0 }}>
            Try again
          </button>
          <a href="/home" style={{ ...button, lineHeight: "52px", background: "#ffffff", color: "#0e1d1c", border: "1px solid #84928f", textDecoration: "none", boxSizing: "border-box" }}>
            Go to Home
          </a>
        </main>
      </body>
    </html>
  );
}
