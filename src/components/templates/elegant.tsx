/* eslint-disable @next/next/no-img-element -- templates are rendered to images; data: URLs only */
import { brandTextColour } from "@/lib/color";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import { computeTotals, lineTotalKobo } from "@/lib/totals";
import {
  breakdownRows,
  contactLines,
  formatQuantity,
  METHOD_LABEL,
  showsBankDetails,
  STATUS_LABEL,
  TEMPLATE_FONT,
  TEMPLATE_WIDTH,
  type TemplateProps,
} from "./shared";
import { PayNowBlock } from "./pay-now-block";

/** Elegant (Pro): centred, airy, thin lines and spaced capitals. Suits fashion and beauty. */
export function ElegantTemplate({ doc, profile, showFooterBrand, payNow }: TemplateProps) {
  const accent = brandTextColour(profile.brandColor);
  const totals = computeTotals(doc);
  const isInvoice = doc.type === "invoice";
  const rule = <div className="my-5 h-px" style={{ backgroundColor: profile.brandColor, opacity: 0.35 }} />;

  return (
    <div
      style={{ width: TEMPLATE_WIDTH, fontFamily: TEMPLATE_FONT }}
      className="bg-[#fffdf9] px-10 pt-9 pb-5 text-[12.5px] leading-relaxed text-[#1f2937]"
    >
      <div className="text-center">
        {profile.logo && <img src={profile.logo} alt="" className="mx-auto mb-3 max-h-16 max-w-[160px] object-contain" />}
        <div style={{ color: accent }} className="text-[20px] font-light tracking-[0.25em] uppercase break-words">
          {profile.name || "Your business"}
        </div>
        {contactLines(profile).map((line) => (
          <div key={line} className="text-[11px] tracking-wide break-words text-[#6b7280]">
            {line}
          </div>
        ))}
      </div>

      {rule}

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] tracking-[0.3em] text-[#9ca3af] uppercase">{isInvoice ? "Invoice" : "Receipt"}</div>
          <div className="text-[15px] font-medium">{doc.number}</div>
        </div>
        <div className="text-right text-[11.5px] text-[#4b5563]">
          <div>{formatDate(doc.issueDate)}</div>
          {isInvoice && doc.dueDate && <div>Due {formatDate(doc.dueDate)}</div>}
        </div>
      </div>

      {(doc.customer.name || doc.customer.phone) && (
        <div className="mt-4">
          <div className="text-[10.5px] tracking-[0.3em] text-[#9ca3af] uppercase">{isInvoice ? "Prepared for" : "Thank you"}</div>
          <div className="text-[14px] font-medium">{doc.customer.name}</div>
          {doc.customer.phone && <div className="text-[11.5px] text-[#6b7280]">{formatNgPhone(doc.customer.phone)}</div>}
        </div>
      )}

      {rule}

      {doc.items.map((item) => (
        <div key={item.id} className="flex items-baseline gap-3 py-1.5">
          <div className="min-w-0 flex-1">
            <span className="break-words">{item.description}</span>
            <span className="ml-2 text-[11px] text-[#9ca3af] tabular-nums">
              {formatQuantity(item.quantity)} × {formatNaira(item.unitPriceKobo)}
            </span>
          </div>
          <div className="shrink-0 tabular-nums">{formatNaira(lineTotalKobo(item))}</div>
        </div>
      ))}

      {rule}

      <div className="ml-auto w-60 tabular-nums">
        {breakdownRows(doc, totals).map((r) => (
          <div key={r.label} className="flex justify-between text-[#4b5563]">
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
        <div style={{ color: accent }} className="mt-2 flex justify-between text-[17px] font-semibold">
          <span className="tracking-[0.2em] uppercase">Total</span>
          <span>{formatNaira(totals.totalKobo)}</span>
        </div>
        {doc.status === "part" && (
          <>
            <div className="flex justify-between text-[#4b5563]">
              <span>Paid</span>
              <span>{formatNaira(totals.amountPaidKobo)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Balance</span>
              <span>{formatNaira(totals.balanceKobo)}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 text-center text-[11px] tracking-[0.3em] text-[#6b7280] uppercase">
        {STATUS_LABEL[doc.status]}
        {doc.status !== "unpaid" && ` · ${METHOD_LABEL[doc.method]}`}
      </div>
      {doc.sourceInvoiceNumber && <div className="text-center text-[11px] text-[#9ca3af]">For invoice {doc.sourceInvoiceNumber}</div>}

      {payNow && <PayNowBlock url={payNow.url} qr={payNow.qr} colour={accent} />}
      {showsBankDetails(doc, profile) && (
        <div className="mt-4 text-center">
          <div className="text-[10.5px] tracking-[0.3em] text-[#9ca3af] uppercase">Payment details</div>
          <div className="text-[16px] font-medium tracking-[0.15em] tabular-nums">{profile.accountNumber}</div>
          <div className="text-[12px] text-[#4b5563]">
            {profile.bankName}
            {profile.accountName && ` · ${profile.accountName}`}
          </div>
        </div>
      )}

      {doc.notes && <div className="mt-4 text-center text-[11.5px] whitespace-pre-line text-[#6b7280] italic">{doc.notes}</div>}

      {showFooterBrand && <div className="mt-5 text-center text-[9.5px] text-[#9ca3af]">Made with InCeipt</div>}
    </div>
  );
}
