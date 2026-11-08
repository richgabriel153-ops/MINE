import Link from "next/link";
import CallMock from "@/components/CallMock";
import OnlineCount from "@/components/OnlineCount";
import SiteFooter from "@/components/SiteFooter";
import StartPanel from "@/components/StartPanel";
import { Logo } from "@/components/icons";

const facts = ["No account", "Skip anytime", "Video goes peer-to-peer"];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-8 sm:pt-6">
        <Link href="/" aria-label="Linkup home">
          <Logo />
        </Link>
        <OnlineCount />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-10 pt-6 sm:px-8 md:grid-cols-[1.1fr_0.9fr] md:gap-16 md:pt-10">
        <section className="flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-[44px] leading-[0.98] tracking-[-0.04em] text-balance sm:text-[60px] lg:text-[72px]">
              Video chat with a random stranger, one on one.
            </h1>
            <p className="max-w-[34ch] text-[17px] leading-relaxed text-muted sm:max-w-[44ch] sm:text-[19px]">
              Tap start and Linkup connects your camera to someone new in seconds. Not a fit? Hit Next and meet
              someone else.
            </p>
          </div>
          <StartPanel />
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-muted">
            {facts.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-lime" />
                {f}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="What a call looks like">
          <CallMock />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
