"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Landmark, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ProLock, useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { createPayLink } from "@/lib/cloud/repo";
import { displayUrl } from "@/lib/pay-link";
import type { DocumentRecord } from "@/lib/types";

/** On an invoice: add a Pay Now link so the customer can pay online. */
export function PayLinkPanel({
  doc,
  url,
  onLinked,
}: {
  doc: DocumentRecord;
  /** The link, once the invoice has one. */
  url: string | null;
  onLinked: (token: string) => void;
}) {
  const { access, showUpgrade } = useAccess();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!access) return null;

  const box = "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs";
  const title = (
    <div className="flex items-center gap-2 font-semibold">
      <Link2 className="size-5 text-primary" /> Pay Now link {!access.can.payLinks && <ProLock />}
    </div>
  );

  if (url)
    return (
      <div className={box}>
        {title}
        <p className="text-sm text-muted-foreground">
          Your customer can pay this invoice online. The link is on the invoice image, the PDF and your WhatsApp message.
          When they pay, the invoice updates by itself.
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-2 pl-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayUrl(url)}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(url).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    );

  if (!access.can.payLinks)
    return (
      <div className={box}>
        {title}
        <p className="text-sm text-muted-foreground">Let customers pay invoices online by card, transfer or USSD.</p>
        <Button variant="outline" onClick={() => showUpgrade("Pay Now links")}>
          Add Pay Now link
        </Button>
      </div>
    );

  if (access.mode === "local")
    return (
      <div className={box}>
        {title}
        <p className="text-sm text-muted-foreground">Pay Now links need a free InCeipt account, so payments can reach you.</p>
        <Button asChild variant="outline">
          <Link href="/account">Sign in or create account</Link>
        </Button>
      </div>
    );

  if (!access.cloud?.payoutsConnected)
    return (
      <div className={box}>
        {title}
        {access.role === "owner" ? (
          <>
            <p className="text-sm text-muted-foreground">First, tell us which bank account should receive online payments.</p>
            <Button asChild variant="outline">
              <Link href="/payouts">
                <Landmark /> Set up online payments
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Ask the business owner to set up online payments first.</p>
        )}
      </div>
    );

  return (
    <div className={box}>
      {title}
      <p className="text-sm text-muted-foreground">Add a link so the customer can pay online by card, transfer or USSD.</p>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onLinked(await createPayLink(doc.id));
            toast.success("Pay Now link added");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't add the link.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Add Pay Now link
      </Button>
    </div>
  );
}
