import { cn } from "@/lib/utils";

/**
 * The painted shop-sign panel: deep teal field, ink frame and a light inner keyline,
 * like the hand-painted signboards above Nigerian shops. Carries the seller's identity.
 */
export function Signboard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("relative overflow-hidden rounded-[22px] border-2 border-ink bg-sign p-5 text-white", className)}>
      <span aria-hidden className="pointer-events-none absolute inset-[5px] rounded-[17px] border border-white/25" />
      <div className="relative">{children}</div>
    </section>
  );
}
