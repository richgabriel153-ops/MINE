import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Screen title as a compact signboard strip: teal field, ink frame, light inner keyline. */
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
    <header className="pt-3 pb-4">
      <div className="relative flex min-h-[3.75rem] items-center gap-1 rounded-[18px] border-2 border-ink bg-sign px-2 text-white">
        <span aria-hidden className="pointer-events-none absolute inset-[4px] rounded-[13px] border border-white/25" />
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="press relative flex size-11 shrink-0 items-center justify-center rounded-xl active:bg-white/15"
          >
            <ChevronLeft className="size-6" strokeWidth={2.6} />
          </Link>
        )}
        <h1 className={`relative min-w-0 flex-1 truncate text-[1.35rem] font-extrabold tracking-[-0.01em] ${backHref ? "" : "pl-3"}`}>{title}</h1>
        {action && <div className="relative">{action}</div>}
      </div>
    </header>
  );
}
