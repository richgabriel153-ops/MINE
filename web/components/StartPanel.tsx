"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { isAgeConfirmed, setAgeConfirmed } from "@/lib/session";
import { NextIcon } from "./icons";

export default function StartPanel() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [nudge, setNudge] = useState(false);
  const id = useId();

  useEffect(() => setAgreed(isAgeConfirmed()), []);
  useEffect(() => router.prefetch("/chat"), [router]);

  const onToggle = (v: boolean) => {
    setAgreed(v);
    setAgeConfirmed(v);
    if (v) setNudge(false);
  };

  const onStart = () => {
    if (!agreed) {
      setNudge(true);
      return;
    }
    router.push("/chat");
  };

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
          nudge ? "border-danger/70 bg-danger/5" : "border-line bg-surface"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(e) => onToggle(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lime ${
            agreed ? "border-lime bg-lime text-lime-ink" : "border-muted/60"
          }`}
        >
          {agreed && (
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="text-[15px] leading-snug text-ink/90">
          I am 18 or older and agree to the{" "}
          <Link href="/terms" className="text-lime underline decoration-lime/40 underline-offset-4 hover:decoration-lime">
            community rules
          </Link>
          .
        </span>
      </label>

      <button
        type="button"
        onClick={onStart}
        aria-disabled={!agreed}
        className={`press flex h-14 w-full items-center justify-center gap-2 rounded-full text-[17px] font-medium sm:w-auto sm:self-start sm:px-9 ${
          agreed ? "bg-lime text-lime-ink hover:bg-[#d4f6b3]" : "bg-raised text-muted"
        }`}
      >
        Start chatting
        <NextIcon className="size-5" />
      </button>
      <p className={`text-[13px] ${nudge ? "text-danger" : "sr-only"}`} role="status">
        {nudge ? "Tick the box to confirm you are 18 or older." : ""}
      </p>
    </div>
  );
}
