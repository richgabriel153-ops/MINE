"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { parseQuantity } from "@/lib/document-form";

export function QuantityInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value === null ? "" : String(value));
  }
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className="text-center tabular-nums"
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const q = parseQuantity(e.target.value);
        setLastValue(q);
        onChange(q);
      }}
    />
  );
}
