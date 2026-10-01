"use client";

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

/** A row of big buttons where exactly one is chosen (radio group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  /** `locked` options show a lock (e.g. Pro-only); tapping them still calls onChange. */
  options: readonly { value: T; label: string; locked?: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 rounded-xl bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-11 cursor-pointer rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-colors",
              selected && "bg-card text-foreground shadow-sm",
            )}
          >
            <span className="inline-flex items-center gap-1">
              {o.label}
              {o.locked && <Lock className="size-3.5 text-[#8a6a2b]" aria-label="Pro" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
