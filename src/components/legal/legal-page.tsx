import Link from "next/link";
import { ReceiptText } from "lucide-react";

import { LEGAL, LEGAL_PAGES } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Shared layout for the policy pages: readable on a phone, printable, linked to each other. */
export function LegalPage({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </span>
          InCeipt
        </Link>
        <Link href="/home" className="text-sm font-semibold text-primary">
          Open app
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <nav aria-label="Policies" className="mb-6 flex flex-wrap gap-2 text-sm">
          {LEGAL_PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={p.href === current ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5", p.href === current ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Effective {LEGAL.effective}</p>
        <article className="legal mt-6 flex flex-col gap-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_a]:font-medium [&_a]:text-primary [&_a]:underline">
          {children}
        </article>
        <ContactBlock />
      </main>
    </div>
  );
}

export function ContactBlock() {
  return (
    <section className="mt-10 rounded-2xl border bg-card p-5 text-sm">
      <h2 className="text-base font-bold">Contact us</h2>
      <p className="mt-1">{LEGAL.name}</p>
      {LEGAL.address && <p>{LEGAL.address}</p>}
      {LEGAL.email && (
        <p>
          Email:{" "}
          <a className="font-medium text-primary underline" href={`mailto:${LEGAL.email}`}>
            {LEGAL.email}
          </a>
        </p>
      )}
      {LEGAL.phone && <p>Phone: {LEGAL.phone}</p>}
    </section>
  );
}

/** "email us at x" (or "contact us using the details below" until an email is set). */
export function EmailUs({ start = false }: { start?: boolean }) {
  return LEGAL.email ? (
    <>
      {start ? "Email" : "email"} us at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
    </>
  ) : (
    <>{start ? "Contact" : "contact"} us using the details at the bottom of this page</>
  );
}
