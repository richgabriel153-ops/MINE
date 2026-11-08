import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-[13px] text-muted sm:px-8">
      <span>Linkup is for adults only (18+).</span>
      <nav className="flex gap-5">
        <Link href="/terms" className="hover:text-ink">Community rules</Link>
        <Link href="/" className="hover:text-ink">Home</Link>
      </nav>
    </footer>
  );
}
