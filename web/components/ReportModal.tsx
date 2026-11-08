"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

export type ReportReason = "nudity" | "harassment" | "underage" | "spam" | "other";

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "nudity", label: "Nudity or sexual content", hint: "Exposed body, sexual acts or gestures" },
  { value: "harassment", label: "Harassment or hate", hint: "Threats, slurs, bullying" },
  { value: "underage", label: "Looks under 18", hint: "The stranger appears to be a minor" },
  { value: "spam", label: "Spam or scam", hint: "Ads, links, bots, asking for money" },
  { value: "other", label: "Something else", hint: "Tell us in the note below" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, note: string) => void;
};

export default function ReportModal({ open, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setReason(null);
      setNote("");
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason) onSubmit(reason, note.trim());
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-labelledby="report-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[28px] border border-line bg-surface p-0 text-ink backdrop:bg-black/60 sm:m-auto sm:max-w-md sm:rounded-[28px]"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="report-title" className="font-display text-[24px] tracking-[-0.02em]">
              Report this stranger
            </h2>
            <p className="mt-1 text-[14px] text-muted">We&apos;ll save your report and skip to someone new.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press -mr-1 grid size-10 shrink-0 place-items-center rounded-full bg-raised hover:bg-line">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                reason === r.value ? "border-lime bg-lime/10" : "border-line hover:bg-raised"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="size-4 shrink-0 accent-[#c6f19d]"
              />
              <span className="flex flex-col">
                <span className="text-[15px]">{r.label}</span>
                <span className="text-[13px] text-muted">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] text-muted">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="resize-none rounded-2xl bg-bg px-4 py-3 text-[16px] outline-none placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-lime"
            placeholder="What happened?"
          />
        </label>

        <button
          type="submit"
          disabled={!reason}
          className="press h-13 rounded-full bg-lime py-3.5 text-[16px] font-medium text-lime-ink hover:bg-[#d4f6b3] disabled:bg-raised disabled:text-muted"
        >
          Send report and skip
        </button>
      </form>
    </dialog>
  );
}
