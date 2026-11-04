"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// Matte, professional colours that print and share well. The first is the InCeipt default.
const SWATCHES = ["#0b5f5a", "#1d4e89", "#11764a", "#8c3b5e", "#b4441f", "#8a5300", "#3f5b24", "#1f2a2a"];

export function ColourPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const isCustom = !SWATCHES.includes(value.toLowerCase());
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Brand colour">
      {SWATCHES.map((hex) => {
        const selected = value.toLowerCase() === hex;
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={hex}
            onClick={() => onChange(hex)}
            className={cn(
              "flex size-11 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
              selected && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: hex }}
          >
            {selected && <Check className="size-5 text-white" />}
          </button>
        );
      })}
      <label
        className={cn(
          "relative flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-input text-xs font-semibold text-muted-foreground ring-offset-2 ring-offset-background",
          isCustom && "border-solid ring-2 ring-foreground",
        )}
        style={isCustom ? { backgroundColor: value } : undefined}
        title="Choose your own colour"
      >
        {isCustom ? <Check className="size-5 text-white" /> : "+"}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Choose your own colour"
        />
      </label>
    </div>
  );
}
