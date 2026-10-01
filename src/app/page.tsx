import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CloudOff, Lock, MessageCircle, ReceiptText, Smartphone, Store, Wallet } from "lucide-react";

import { InstallButton } from "@/components/pwa/install-button";
import { ClassicTemplate } from "@/components/templates/classic";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { Button } from "@/components/ui/button";
import { SAMPLE_PROFILE, SAMPLE_RECEIPT } from "@/lib/sample";

export const metadata: Metadata = {
  title: { absolute: "InCeipt – Free receipts & invoices on WhatsApp" },
};

const STEPS = [
  {
    icon: Store,
    title: "Add your business once",
    text: "Your name, logo, phone and bank details. They appear on every receipt.",
  },
  {
    icon: ReceiptText,
    title: "Type what you sold",
    text: "Add items and prices. We work out the total, discount, delivery and balance for you.",
  },
  {
    icon: MessageCircle,
    title: "Send it on WhatsApp",
    text: "A neat, clear image goes straight to your customer. Or save it as a PDF.",
  },
] as const;

const POINTS = [
  { icon: Wallet, title: "Free to use", text: "Make as many receipts as you like." },
  { icon: Lock, title: "Your records stay with you", text: "Saved on your phone. No sign-up, no password." },
  { icon: CloudOff, title: "Works with poor network", text: "Light and fast. Works offline once installed." },
  { icon: Smartphone, title: "Made for Naija business", text: "₦ amounts, transfer, POS and cash, part payments." },
] as const;

const TRADES = ["Fashion & tailoring", "Food & catering", "Hair & beauty", "Phones & gadgets", "Logistics & delivery", "Any small business"];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </span>
          InCeipt
        </Link>
        <Link href="/home" className="text-sm font-semibold text-primary">
          Open app
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pt-4 pb-14 md:grid-cols-2 md:pt-10">
          <div className="flex flex-col gap-5">
            <h1 className="text-[2rem] leading-[1.15] font-extrabold tracking-tight md:text-5xl">
              Send neat receipts on WhatsApp in <span className="text-primary">30 seconds</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Stop sending handwritten receipts and screenshots. Make clean receipts and invoices with your logo, free,
              right on your phone.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-16 text-xl sm:px-8">
                <Link href="/create">
                  Create a receipt <ArrowRight className="size-6" />
                </Link>
              </Button>
              <InstallButton />
            </div>
            <p className="text-sm text-muted-foreground">No sign-up. No password. Free.</p>
          </div>
          <div className="mx-auto w-full max-w-[400px] rotate-[-1.5deg]">
            <ScaledPreview>
              <ClassicTemplate doc={SAMPLE_RECEIPT} profile={SAMPLE_PROFILE} showFooterBrand />
            </ScaledPreview>
            <p className="mt-3 rotate-[1.5deg] text-center text-sm text-muted-foreground">A real receipt made with InCeipt</p>
          </div>
        </section>

        <section id="how" className="border-y bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">How it works</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4 md:flex-col">
                  <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <step.icon className="size-7" />
                    <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-1 text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Built for small businesses like yours</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {TRADES.map((t) => (
              <span key={t} className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {POINTS.map((p) => (
              <div key={p.title} className="flex gap-4 rounded-2xl border bg-card p-5">
                <p.icon className="size-7 shrink-0 text-primary" />
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-sm text-muted-foreground">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 py-14 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">Your next customer deserves a proper receipt</h2>
            <Button asChild size="lg" variant="secondary" className="h-16 w-full max-w-sm text-xl">
              <Link href="/create">Create a receipt</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <Link href="/home">Open app</Link>
          <Link href="/pro">Go Pro</Link>
        </div>
        <p>InCeipt · Made for Nigerian small businesses</p>
      </footer>
    </div>
  );
}
