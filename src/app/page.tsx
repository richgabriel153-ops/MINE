import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileText, ReceiptText } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Signboard } from "@/components/brand/signboard";
import { WhatsAppIcon } from "@/components/brand/whatsapp-icon";
import { Stamp } from "@/components/history/document-card";
import { ReceiptCollage } from "@/components/landing/receipt-collage";
import { SAMPLE_SETS } from "@/components/landing/landing-samples";
import { getTemplate } from "@/components/templates";
import { COMPACT_WIDTH } from "@/components/templates/compact";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { STATUS_COLOUR, TEMPLATE_WIDTH } from "@/components/templates/shared";
import { PLANS } from "@/lib/billing";
import { formatNaira } from "@/lib/money";

export const metadata: Metadata = {
  title: { absolute: "InCeipt: receipt and invoice app for Nigerian shops" },
  description:
    "Type what you sold and InCeipt adds the total, VAT and balance. Send a neat receipt with your logo on WhatsApp in 30 seconds. Free to start.",
};

const MAIN_ACTION = "Create free account";

const WRAP = "mx-auto w-full max-w-[1240px] px-4 md:px-8";
const SCREEN = "flex min-h-[100svh] flex-col justify-center py-16 md:py-20";
const PANEL = "rounded-2xl border bg-card";
const H2 = "text-[2rem] leading-[1.08] font-extrabold tracking-[-0.015em] md:text-[2.75rem]";
const LEAD = "mt-4 text-[#2f3f3e]";

function MainButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/signup"
      className={`press inline-flex h-14 items-center justify-center rounded-2xl border-2 border-ink bg-highlight px-7 text-lg font-extrabold text-ink transition-colors hover:bg-[#f07a45] active:bg-[#d65f2c] md:h-16 md:text-xl ${className}`}
    >
      {MAIN_ACTION}
    </Link>
  );
}

const OWED = [
  { name: "Tunde Bakare", ref: "RCT-0008", status: "part" as const, total: 8_500_000, balance: 3_500_000 },
  { name: "Zainab Events", ref: "INV-0002", status: "part" as const, total: 204_250_000, balance: 104_250_000 },
  { name: "Ada Okafor", ref: "INV-0003", status: "unpaid" as const, total: 18_000_000, balance: 18_000_000 },
];

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className={`${WRAP} flex h-16 items-center gap-3 md:h-20`} aria-label="Main">
          <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-extrabold">
            <BrandMark /> InCeipt
          </Link>
          <div className="-mr-3 ml-auto flex items-center gap-1 sm:mr-0 md:gap-3">
            <Link href="/signin" className="flex min-h-11 items-center rounded-xl px-3 font-bold text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
            <Link
              href="/signup"
              className="press hidden h-11 items-center rounded-xl border-2 border-ink bg-highlight px-4 font-extrabold text-ink transition-colors hover:bg-[#f07a45] sm:inline-flex"
            >
              {MAIN_ACTION}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero: headline, the receipts collage, the main button */}
        <section className="flex min-h-[100svh] flex-col pt-16 md:pt-20">
          <div className={`${WRAP} grid flex-1 grid-cols-1 content-center gap-5 py-4 md:grid-cols-12 md:items-center md:gap-6 md:py-8`}>
            <div className="md:col-span-3">
              <h1 className="text-[2.5rem] leading-[1.04] font-extrabold tracking-[-0.02em] text-balance md:text-[3.25rem]">
                Receipt app for Nigerian shops
              </h1>
              <p className="mt-4 max-w-[34ch] text-base leading-6 text-[#2f3f3e]">
                Type what you sold and InCeipt adds the total, VAT and balance. Send it with your logo on WhatsApp in 30 seconds.
              </p>
            </div>
            <div data-visual className="h-[max(300px,calc(100svh-25rem))] md:col-span-6 md:col-start-4 md:h-[min(716px,calc(100svh-10rem))]">
              <ReceiptCollage />
            </div>
            <div className="flex flex-col gap-2 md:col-span-3 md:col-start-10 md:items-end">
              <MainButton className="w-full md:w-auto" />
              <p className="text-center text-sm font-semibold text-muted-foreground md:text-right">Free to start. No card needed.</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className={SCREEN}>
          <div className={`${WRAP} grid gap-8 md:grid-cols-12 md:items-start`}>
            <div className="md:col-span-4">
              <h2 className={H2}>Receipts on WhatsApp in three steps</h2>
              <p className={`${LEAD} max-w-[40ch]`}>
                No calculator, no carbon paper. Your customer gets a clear receipt they can keep and show anyone.
              </p>
            </div>
            <ol data-visual className="grid gap-3 md:col-span-8 md:grid-cols-3">
              <li className={`${PANEL} flex flex-col gap-5 p-5 md:min-h-[min(34rem,62svh)] md:p-6`}>
                <h3 className="text-lg font-extrabold text-balance">Type items and prices</h3>
                <div data-ui className="flex flex-col gap-2 text-sm" aria-hidden>
                  {[
                    ["Ankara gown", "1", "₦25,000"],
                    ["Aso-oke gele", "2", "₦7,500"],
                    ["Lace (yards)", "1.5", "₦6,000"],
                  ].map(([item, qty, price]) => (
                    <div key={item} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-lg border-2 border-input/50 px-3 py-2.5 md:text-base">
                      <span className="col-span-2 font-semibold">{item}</span>
                      <span className="amount text-muted-foreground">Qty {qty}</span>
                      <span className="amount font-bold">{price}</span>
                    </div>
                  ))}
                  <div className="rounded-lg border-2 border-dashed border-input/60 px-3 py-3 text-center font-bold text-muted-foreground">+ Add another item</div>
                </div>
              </li>
              <li className={`${PANEL} flex flex-col gap-5 p-5 md:min-h-[min(34rem,62svh)] md:p-6`}>
                <h3 className="text-lg font-extrabold text-balance">Totals worked out for you</h3>
                <dl data-ui className="amount flex flex-col gap-2.5 text-sm md:text-base" aria-hidden>
                  {[
                    ["Subtotal", "₦49,000"],
                    ["Discount", "−₦2,000"],
                    ["Delivery", "₦2,500"],
                    ["VAT (7.5%)", "₦3,525"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between rounded-lg bg-sign px-3 py-3 text-lg font-extrabold text-white">
                    <dt>Total</dt>
                    <dd>₦53,025</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd className="font-semibold">₦30,000</dd>
                  </div>
                  <div className="flex justify-between font-bold text-destructive">
                    <dt>Balance</dt>
                    <dd>₦23,025</dd>
                  </div>
                </dl>
              </li>
              <li className={`${PANEL} flex flex-col gap-5 p-5 md:min-h-[min(34rem,62svh)] md:p-6`}>
                <h3 className="text-lg font-extrabold text-balance">Send it on WhatsApp</h3>
                <div data-ui aria-hidden className="flex flex-1 flex-col gap-2">
                  <div className="flex-1 rounded-xl bg-[#efe7de] p-3">
                    <div className="ml-auto w-[85%] rounded-xl rounded-tr-sm border border-black/10 bg-[#d9fdd3] p-2">
                      <div className="flex items-center gap-2 rounded-lg bg-white p-2">
                        <ReceiptText className="size-8 shrink-0 text-primary" />
                        <div className="min-w-0 text-sm">
                          <div className="font-bold break-all">RCT-0024.png</div>
                          <div className="text-muted-foreground">Ada&apos;s Fashion House</div>
                        </div>
                      </div>
                      <p className="mt-1.5 px-1 text-sm">Thank you for your patronage!</p>
                    </div>
                  </div>
                  <div className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-[#1b7f4c] font-bold text-white">
                    <WhatsAppIcon className="size-5 rounded-full bg-white p-0.5" /> Send receipt
                  </div>
                  <div className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink/85 bg-card font-bold">
                    <FileText className="size-5" /> Save as PDF
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Who owes you */}
        <section id="owed" className={`${SCREEN} bg-card`}>
          <div className={`${WRAP} grid gap-8 md:grid-cols-12 md:items-start`}>
            <div className="md:col-span-5">
              <h2 className={H2}>See who owes you money</h2>
              <p className={`${LEAD} max-w-[42ch]`}>
                Record part payments as they come in. InCeipt keeps every balance and shows the total owed when you open the app.
              </p>
            </div>
            <div data-visual data-ui className="flex flex-col gap-3 md:col-span-6 md:col-start-7" aria-hidden>
              <Signboard>
                <div className="text-sm font-semibold text-on-sign-muted">Owed to you</div>
                <div className="amount text-[2rem] leading-tight font-extrabold text-on-sign-warm">{formatNaira(OWED.reduce((s, r) => s + r.balance, 0))}</div>
                <div className="text-sm text-on-sign-muted">3 customers</div>
              </Signboard>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-background">
                {OWED.map((r) => (
                  <li key={r.ref} className="flex items-center gap-3 px-4 py-4 md:px-5 md:py-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold md:text-lg">{r.name}</div>
                      <div className="amount text-sm text-muted-foreground">{r.ref}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="amount font-extrabold md:text-lg">{formatNaira(r.total)}</div>
                      <Stamp colour={STATUS_COLOUR[r.status]}>{r.status === "part" ? "Part paid" : "Unpaid"}</Stamp>
                      <div className="amount text-xs font-semibold text-destructive">Bal. {formatNaira(r.balance)}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex h-14 items-center justify-center rounded-2xl border-2 border-ink bg-card text-lg font-bold">Record a payment</div>
            </div>
          </div>
        </section>

        {/* Your brand */}
        <section id="brand" className={SCREEN}>
          <div className={WRAP}>
            <div className="max-w-[46rem]">
              <h2 className={H2}>Your brand on every receipt</h2>
              <p className={`${LEAD} max-w-[48ch]`}>
                Add your logo, colour and bank details once. They print on every receipt, invoice and quote you send.
              </p>
            </div>
            <div data-visual data-ui className="mt-8 grid grid-cols-2 items-start gap-3 md:grid-cols-3 md:gap-5" aria-hidden>
              {SAMPLE_SETS.map((set, i) => {
                const Template = getTemplate(set.template, true).Component;
                return (
                  <div
                    key={set.key}
                    className={`overflow-hidden rounded-xl border-2 border-ink bg-white md:h-[min(30rem,calc(100svh-22rem))] ${i === 0 ? "col-span-2 h-72 md:col-span-1" : "h-56"}`}
                  >
                    <ScaledPreview width={set.template === "compact" ? COMPACT_WIDTH : TEMPLATE_WIDTH}>
                      <Template doc={set.doc} profile={set.profile} showFooterBrand={false} />
                    </ScaledPreview>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Prices */}
        <section id="prices" className={`${SCREEN} bg-card`}>
          <div className={WRAP}>
            <h2 className={H2}>Prices</h2>
            <p className={`${LEAD} max-w-[52ch]`}>Receipts and invoices are free. Pro adds the tools for chasing money and running the business.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-2xl border-2 border-ink/85 bg-background p-6">
                <h3 className="text-xl font-extrabold">Free</h3>
                <div className="amount text-[2rem] leading-none font-extrabold md:text-[2.25rem]">₦0</div>
                <ul className="flex flex-col gap-2">
                  {["Unlimited receipts and invoices", "Send on WhatsApp, or save as image or PDF", "Your logo and bank details", "3 receipt designs"].map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border-2 border-ink bg-sign p-6 text-white">
                <h3 className="text-xl font-extrabold">Pro</h3>
                <div>
                  <span className="amount text-[2rem] leading-none font-extrabold md:text-[2.25rem]">{formatNaira(PLANS.monthly.kobo)}</span>
                  <span className="text-on-sign-muted"> a month, or {formatNaira(PLANS.yearly.kobo)} a year</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {["Part payments and who owes you", "Quotes that turn into invoices", "Expenses, profit and tax estimates", "Staff accounts and 5 designs, no InCeipt footer"].map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-5 shrink-0 text-on-sign-warm" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
                <div data-ui aria-hidden className="mt-auto flex flex-col gap-2 rounded-xl bg-sign-deep p-3">
                  <div className="text-sm font-semibold">Free for beta testers with a beta code</div>
                  <div className="flex gap-2">
                    <div className="amount flex h-12 min-w-0 flex-1 items-center rounded-xl border-2 border-ink bg-white px-3 font-bold tracking-wider text-ink">INCEIPT-BETA</div>
                    <div className="flex h-12 items-center rounded-xl border-2 border-ink bg-white px-4 font-bold text-ink">Unlock</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Close: the sign, a receipt being sent, and the footer on the same ground */}
        <section className="flex min-h-[100svh] flex-col border-t-2 border-ink bg-sign text-white">
          <div className={`${WRAP} grid flex-1 content-center gap-10 py-16 md:grid-cols-12 md:items-start md:gap-6`}>
            <div className="flex flex-col items-start gap-6 md:col-span-6">
              <BrandMark className="size-20 md:size-24" />
              <h2 className={`${H2} max-w-[16ch]`}>Your next customer deserves a proper receipt</h2>
              <p className="max-w-[40ch] text-white">Set up your shop once. After that, every sale is a receipt on WhatsApp in under a minute.</p>
              <MainButton className="w-full md:w-auto" />
            </div>
            <div data-visual data-ui aria-hidden className="flex flex-col gap-3 rounded-[22px] border-2 border-ink bg-[#efe7de] p-4 text-ink md:col-span-5 md:col-start-8 md:p-6">
              <div className="flex items-center gap-2 border-b border-black/10 pb-3 font-bold">
                <WhatsAppIcon className="size-6" /> Ada Okafor
              </div>
              <div className="max-w-[80%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2">I have sent the money. Please send my receipt.</div>
              <div className="w-[85%] self-end rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-2">
                <div className="flex items-center gap-2 rounded-lg bg-white p-2">
                  <ReceiptText className="size-8 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="truncate font-bold">RCT-0025.png</div>
                    <div className="text-sm text-[#46585a]">Ada&apos;s Fashion House</div>
                  </div>
                </div>
                <p className="mt-1.5 px-1">Paid in full. Thank you!</p>
              </div>
              <div className="max-w-[80%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2">Received. Thank you, ma!</div>
            </div>
          </div>
          <footer className={`${WRAP} flex flex-col gap-3 pt-2 pb-[4.5rem] text-sm text-on-sign-muted md:flex-row md:items-center md:justify-between`}>
            <div className="flex items-center gap-2 font-bold text-white">
              <BrandMark className="size-7" /> InCeipt
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/signin" className="hover:text-white hover:underline">Log in</Link>
              <Link href="/terms" className="hover:text-white hover:underline">Terms</Link>
              <Link href="/privacy" className="hover:text-white hover:underline">Privacy</Link>
              <Link href="/refunds" className="hover:text-white hover:underline">Refunds</Link>
            </nav>
            <p>WhatsApp is a trademark of its owner.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}
