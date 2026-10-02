"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { formatKoboForInput, parseNairaToKobo } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Naira amount box. The value is kobo (integer), or null when empty.
 * Users type naturally ("25000", "25,000.50"); it's tidied up with commas when they leave the box.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = "0",
  className,
  invalid,
  ...rest
}: {
  id: string;
  value: number | null;
  onChange: (kobo: number | null) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "id">) {
  const [text, setText] = useState(() => (value === null ? "" : formatKoboForInput(value)));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    setText(value === null ? "" : formatKoboForInput(value));
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">₦</span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className="pl-7 tabular-nums"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const kobo = raw.trim() === "" ? null : parseNairaToKobo(raw);
          if (raw.trim() === "" || kobo !== null) {
            setLastValue(kobo);
            onChange(kobo);
          }
        }}
        onBlur={() => {
          if (value !== null) setText(formatKoboForInput(value));
          else setText("");
        }}
        {...rest}
      />
    </div>
  );
}
