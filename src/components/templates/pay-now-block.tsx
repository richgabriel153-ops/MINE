/* eslint-disable @next/next/no-img-element -- QR code is a data: URL */
import { displayUrl } from "@/lib/pay-link";

/** "Pay online" box with QR code, shared by all templates. */
export function PayNowBlock({ url, qr, colour }: { url: string; qr?: string; colour: string }) {
  return (
    <div style={{ borderColor: colour }} className="mt-4 flex items-center gap-4 rounded-xl border-2 px-4 py-3">
      {qr && <img src={qr} alt="" className="size-[84px] shrink-0" />}
      <div className="min-w-0">
        <div style={{ color: colour }} className="text-[14px] font-bold">
          Pay online now
        </div>
        <div className="text-[11.5px] text-[#4b5563]">Card, bank transfer or USSD. Scan the code or open:</div>
        <div className="mt-0.5 text-[12px] font-semibold break-all text-[#111827]">{displayUrl(url)}</div>
      </div>
    </div>
  );
}
