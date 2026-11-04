/** What the phone sends when something breaks. Kept small and free of personal details. */
export interface ErrorReport {
  kind: string;
  message: string;
  page: string;
  digest: string;
  trace: string;
  appVersion: string;
}

const cut = (v: unknown, n: number) => (typeof v === "string" ? v : "").slice(0, n);

/** Remove things that could identify a person: emails, phone and account numbers, long tokens. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]")
    .replace(/\b(ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_[a-z]+_[A-Za-z0-9_-]{10,})\b/g, "[token]");
}

/** Check and tidy a report from the phone; null if it isn't one. */
export function cleanReport(body: unknown): ErrorReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const message = scrub(cut(b.message, 500)).trim();
  if (!message) return null;
  const kind = /^[a-z-]{1,40}$/.test(cut(b.kind, 40)) ? cut(b.kind, 40) : "error";
  // Only the path, never the query string (it can hold search words or ids).
  const page = cut(b.page, 300).split("?")[0].split("#")[0];
  return {
    kind,
    message,
    page: /^\/[\w\-/.]*$/.test(page) ? page : "",
    digest: /^[\w-]{0,100}$/.test(cut(b.digest, 100)) ? cut(b.digest, 100) : "",
    trace: scrub(cut(b.trace, 2000)),
    appVersion: cut(b.appVersion, 40).replace(/[^\w.-]/g, ""),
  };
}
