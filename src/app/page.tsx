import Link from "next/link";

import { Button } from "@/components/ui/button";

// Temporary start page. The full landing page comes in stage 4.
export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold tracking-tight">ReceiptNaija</h1>
      <p className="text-muted-foreground">Neat receipts and invoices for your business, made on your phone.</p>
      <Button asChild size="lg" className="w-full">
        <Link href="/create">Create a receipt</Link>
      </Button>
    </main>
  );
}
