"use client";

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TemplateId } from "@/lib/types";
import { TEMPLATES } from "./index";

export function TemplatePicker({
  value,
  onChange,
  onLocked,
  brandColor,
  isPro,
}: {
  value: TemplateId;
  onChange: (id: TemplateId) => void;
  /** Called when a free user taps a Pro template. */
  onLocked: () => void;
  brandColor: string;
  isPro: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Template" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {TEMPLATES.map((t) => {
        const selected = t.id === value;
        const locked = t.pro && !isPro;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={locked ? `${t.name} (Pro)` : t.name}
            onClick={() => (locked ? onLocked() : onChange(t.id))}
            className={cn(
              "flex w-[7.5rem] shrink-0 cursor-pointer flex-col items-start gap-0.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors",
              selected ? "border-primary ring-2 ring-primary/30" : "border-border",
            )}
          >
            <span className="flex w-full items-center gap-1.5 text-sm font-semibold">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: brandColor }} aria-hidden />
              {t.name}
              {t.pro && (
                <span className="ml-auto flex items-center gap-0.5 rounded bg-highlight/25 px-1 text-[9px] font-bold text-[#5a4210]">
                  {locked && <Lock className="size-2.5" aria-hidden />}PRO
                </span>
              )}
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">{t.description}</span>
          </button>
        );
      })}
    </div>
  );
}
