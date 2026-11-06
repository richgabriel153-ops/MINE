import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  backHref,
  action,
}: {
  title: string;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-14 items-center gap-1 pt-2 pb-3">
      {backHref && (
        <Button asChild variant="ghost" size="icon" className="-ml-3" aria-label="Back">
          <Link href={backHref}>
            <ChevronLeft className="size-6" />
          </Link>
        </Button>
      )}
      <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}
