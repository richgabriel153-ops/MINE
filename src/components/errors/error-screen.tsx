"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Friendly "something broke" screen with a way out. */
export function ErrorScreen({ retry }: { retry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[70dvh] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">Sorry, something went wrong</h1>
      <p className="text-muted-foreground">
        Your records are safe. Try again, and if it keeps happening, check your internet connection. We&apos;ve been told
        about the problem.
      </p>
      <div className="flex w-full flex-col gap-2">
        {retry && (
          <Button size="lg" onClick={retry}>
            <RotateCcw /> Try again
          </Button>
        )}
        <Button asChild size="lg" variant="outline">
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
    </div>
  );
}
