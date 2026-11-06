"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCheck, Pause, Play } from "lucide-react";

import { WhatsAppIcon } from "@/components/brand/whatsapp-icon";
import { Stamp } from "@/components/history/document-card";
import { getTemplate } from "@/components/templates";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { COMPACT_WIDTH } from "@/components/templates/compact";
import { STATUS_COLOUR, STATUS_LABEL, TEMPLATE_WIDTH } from "@/components/templates/shared";
import { formatNaira } from "@/lib/money";
import { computeTotals } from "@/lib/totals";

import { SAMPLE_SETS } from "./landing-samples";

const STEP_MS = 2800;

/** Hero visual: three sellers' receipts, each with its WhatsApp send and payment card, crossfading every 2.8 s. */
export function ReceiptCollage() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const start = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % SAMPLE_SETS.length), STEP_MS);
  }, []);

  useEffect(() => {
    if (paused || reduced) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    start();
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [paused, reduced, start]);

  return (
    <div
      data-ui
      className="relative size-full overflow-hidden rounded-[26px] border-2 border-ink bg-sign"
      onMouseEnter={() => !paused && !reduced && start()}
    >
      <span aria-hidden className="pointer-events-none absolute inset-[6px] z-10 rounded-[20px] border border-white/25" />
      {SAMPLE_SETS.map((set, i) => {
        const Template = getTemplate(set.template, true).Component;
        const t = computeTotals(set.doc);
        const colour = STATUS_COLOUR[set.status];
        const shown = i === index;
        return (
          <div
            key={set.key}
            aria-hidden={!shown}
            className="absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none"
            style={{ opacity: shown ? 1 : 0 }}
          >
            <div className="absolute top-[6%] left-[4%] w-[53%] overflow-hidden rounded-lg border-2 border-ink bg-white" style={{ height: "80%" }}>
              <ScaledPreview width={set.template === "compact" ? COMPACT_WIDTH : TEMPLATE_WIDTH}>
                <Template doc={set.doc} profile={set.profile} showFooterBrand={false} />
              </ScaledPreview>
            </div>

            <div className="absolute top-[8%] right-[4%] max-h-[40%] w-[37%] overflow-hidden rounded-2xl rounded-tr-sm border-2 border-ink bg-[#d9fdd3] p-3 text-ink">
              <div className="flex min-w-0 items-center gap-2 text-[13px] font-bold">
                <WhatsAppIcon className="size-5 shrink-0" /> <span className="truncate">To {set.customer}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug">
                {set.doc.type === "invoice" ? "Invoice" : "Receipt"} {set.doc.number} from {set.profile.name}
              </p>
              <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#3d524b]">
                Sent <CheckCheck className="size-3.5 text-[#1d9bd1]" aria-hidden />
              </p>
            </div>

            <div className="absolute right-[4%] bottom-[6%] max-h-[40%] w-[37%] overflow-hidden rounded-2xl border-2 border-ink bg-white p-3 text-ink">
              <Stamp colour={colour}>{STATUS_LABEL[set.status]}</Stamp>
              <div className="amount mt-2 text-[clamp(1rem,2vw,1.5rem)] leading-tight font-extrabold">{formatNaira(t.totalKobo)}</div>
              <div className="text-[13px] font-semibold" style={{ color: set.status === "paid" ? undefined : colour }}>
                {set.status === "part" ? `Balance ${formatNaira(t.balanceKobo)}` : set.note}
              </div>
            </div>
          </div>
        );
      })}
      {!reduced && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the examples" : "Pause the examples"}
          className="press absolute bottom-[2.5%] left-[4%] z-20 flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-highlight text-ink"
        >
          {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}
