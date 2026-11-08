// Static HTML picture of the call screen, so the landing page shows the real product.
import { CamIcon, FlagIcon, MicIcon, NextIcon, StopIcon } from "./icons";

function Person({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="46" r="20" fill="currentColor" />
      <path d="M18 120c4-26 22-40 42-40s38 14 42 40z" fill="currentColor" />
    </svg>
  );
}

export default function CallMock() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-[380px] select-none rounded-[28px] border border-line bg-surface p-2.5">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-[#1b3a1d]">
        <Person className="absolute inset-x-0 bottom-0 mx-auto w-[78%] text-[#2c5a2e]" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-bg/70 px-2.5 py-1 font-mono text-[11px] text-lime">
          <span className="size-1.5 rounded-full bg-lime" /> Connected
        </span>
        <div className="absolute right-3 top-3 h-[30%] w-[26%] overflow-hidden rounded-xl border border-ink/15 bg-[#24452a]">
          <Person className="absolute inset-x-0 bottom-0 mx-auto w-[90%] text-[#3a6a3c]" />
        </div>
        <div className="absolute inset-x-3 bottom-3 flex flex-col items-start gap-1.5 text-[13px]">
          <span className="rounded-2xl rounded-bl-md bg-bg/80 px-3 py-1.5">hey! where are you calling from?</span>
          <span className="self-end rounded-2xl rounded-br-md bg-lime px-3 py-1.5 text-lime-ink">Lisbon. you?</span>
        </div>
      </div>
      <div className="flex items-center gap-2 px-1 pt-2.5">
        {[MicIcon, CamIcon, FlagIcon, StopIcon].map((I, i) => (
          <span key={i} className="grid size-10 place-items-center rounded-full bg-raised text-ink/80">
            <I className="size-[18px]" />
          </span>
        ))}
        <span className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-lime px-4 text-[14px] font-medium text-lime-ink">
          Next <NextIcon className="size-4" />
        </span>
      </div>
    </div>
  );
}
