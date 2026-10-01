"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { formatNgPhone, normaliseNgPhone } from "@/lib/phone";

/**
 * Phone number box. The value is stored as +234XXXXXXXXXX (or "" when empty).
 * Shows the number the local way (0803 123 4567) and reports invalid numbers on blur.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  onValidityChange,
  invalid,
  placeholder = "0803 123 4567",
}: {
  id: string;
  value: string;
  onChange: (e164: string) => void;
  onValidityChange?: (valid: boolean) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => formatNgPhone(value));
  const [lastValue, setLastValue] = useState(value);

  // Value changed from outside (e.g. "same as phone"): show it.
  if (value !== lastValue) {
    setLastValue(value);
    setText(formatNgPhone(value));
  }

  function commit(raw: string) {
    if (raw.trim() === "") {
      setLastValue("");
      onChange("");
      onValidityChange?.(true);
      return;
    }
    const normalised = normaliseNgPhone(raw);
    onValidityChange?.(normalised !== null);
    if (normalised) {
      setLastValue(normalised);
      setText(formatNgPhone(normalised));
      onChange(normalised);
    }
  }

  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={placeholder}
      value={text}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={(e) => {
        setText(e.target.value);
        // Accept as soon as it's valid, so Save works without leaving the box first.
        const normalised = normaliseNgPhone(e.target.value);
        if (normalised) {
          setLastValue(normalised);
          onChange(normalised);
          onValidityChange?.(true);
        } else if (e.target.value.trim() === "") {
          setLastValue("");
          onChange("");
          onValidityChange?.(true);
        } else {
          onValidityChange?.(false);
        }
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
}
