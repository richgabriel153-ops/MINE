import { cn } from "@/lib/utils";

/** The InCeipt app mark: a coral receipt with a "paid" tick, in a teal signboard frame. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-9 shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="#0b5f5a" />
      <rect x="3.5" y="3.5" width="57" height="57" rx="12" fill="none" stroke="#5fb3a6" strokeOpacity=".55" strokeWidth="1.5" />
      <g transform="rotate(-7 32 32)">
        <path
          d="M18 10h28a3 3 0 0 1 3 3v39.5l-5.8-3.6-5.7 3.6-5.6-3.6-5.6 3.6-5.6-3.6-5.7 3.6V13a3 3 0 0 1 3-3z"
          fill="#e86a33"
          stroke="#0e1d1c"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <path d="M22.5 29.5l7 7 13-14" fill="none" stroke="#0e1d1c" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22.5 29.5l7 7 13-14" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
