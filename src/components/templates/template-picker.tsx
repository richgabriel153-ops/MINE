"use client";

import { cn } from "@/lib/utils";
import type { TemplateId } from "@/lib/types";
import { TEMPLATES } from "./index";

export function TemplatePicker({
  value,
  onChange,
  brandColor,
}: {
  value: TemplateId;
  onChange: (id: TemplateId) => void;
  brandColor: string;
}) {
  return (
    <div role="radiogroup" aria-label="Template" className="grid grid-cols-3 gap-2">
      {TEMPLATES.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors",
              selected ? "border-primary ring-2 ring-primary/30" : "border-border",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: brandColor }} aria-hidden />
              {t.name}
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">{t.description}</span>
          </button>
        );
      })}
    </div>
  );
}
