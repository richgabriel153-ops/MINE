import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { Logo } from "@/components/icons";

export const metadata: Metadata = { title: "Community rules · Linkup" };

const rules = [
  {
    title: "You must be 18 or older",
    body: "Linkup is for adults only. If you are under 18, leave now. We report accounts that appear to involve minors.",
  },
  {
    title: "No nudity or sexual content",
    body: "Keep your clothes on and the camera on your face. No sexual acts, gestures or content of any kind.",
  },
  {
    title: "No harassment or hate",
    body: "No threats, slurs, bullying or hate based on race, religion, gender, sexuality, disability or origin.",
  },
  {
    title: "No spam or selling",
    body: "No ads, links to other sites, scams, bots or asking strangers for money or social media.",
  },
  {
    title: "No recording without consent",
    body: "Do not record, screenshot or stream the other person without their clear permission.",
  },
  {
    title: "Protect your privacy",
    body: "Don't share your full name, address, phone number or passwords. Strangers are strangers.",
  },
];

export default function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-8 sm:pt-6">
        <Link href="/" aria-label="Linkup home">
          <Logo />
        </Link>
        <Link href="/" className="press rounded-full border border-line px-4 py-2 text-[14px] hover:bg-surface">
          Back to start
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-12 pt-6 sm:px-8 sm:pt-10">
        <h1 className="font-display text-[40px] leading-[1.02] tracking-[-0.035em] sm:text-[56px]">Community rules</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted">
          Linkup connects you with a random person over live video. These six rules keep it worth using. Break them
          and you can be reported and banned.
        </p>

        <ol className="mt-10 divide-y divide-line border-y border-line">
          {rules.map((r) => (
            <li key={r.title} className="grid grid-cols-[1.25rem_1fr] gap-x-3 py-5">
              <span aria-hidden className="mt-[11px] size-2 rounded-full bg-lime" />
              <div>
                <h2 className="font-display text-[21px] tracking-[-0.015em]">{r.title}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{r.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-10 rounded-3xl bg-surface p-6 sm:p-8">
          <h2 className="font-display text-[24px] tracking-[-0.02em]">Reporting a stranger</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Tap the flag during a chat, pick a reason and send. We save the report with both anonymous session IDs
            and move you to someone new right away. Video is peer-to-peer and is never recorded or stored by Linkup.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
