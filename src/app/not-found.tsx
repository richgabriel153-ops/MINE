import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <SearchX className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">This page doesn&apos;t exist</h1>
      <p className="text-muted-foreground">The link may be wrong or out of date.</p>
      <Button asChild size="lg" className="w-full">
        <Link href="/home">Go to Home</Link>
      </Button>
    </main>
  );
}
