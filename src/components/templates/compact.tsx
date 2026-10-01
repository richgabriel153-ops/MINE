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
  STATUS_COLOUR,
  STATUS_LABEL,
  TEMPLATE_FONT,
  type TemplateProps,
} from "./shared";

export const COMPACT_WIDTH = 420;

function Dashes() {
  return <div className="my-3 border-t-2 border-dashed border-[#d1d5db]" />;
}

/** Compact: narrow till-slip style. Reads well on a phone screen and makes the smallest images. */
export function CompactTemplate({ doc, profile, showFooterBrand }: TemplateProps) {
  const brandText = brandTextColour(profile.brandColor);
  const totals = computeTotals(doc);
  const isInvoice = doc.type === "invoice";

  return (
    <div style={{ width: COMPACT_WIDTH, fontFamily: TEMPLATE_FONT }} className="bg-white px-6 pt-6 pb-4 text-[12.5px] leading-snug text-[#111827]">
      <div className="text-center">
        {profile.logo && <img src={profile.logo} alt="" className="mx-auto mb-2 max-h-14 max-w-[140px] object-contain" />}
        <div style={{ color: brandText }} className="text-[18px] leading-tight font-bold break-words">
          {profile.name || "Your business"}
        </div>
        {contactLines(profile).map((line) => (
          <div key={line} className="text-[11px] break-words text-[#6b7280]">
            {line}
          </div>
        ))}
      </div>

      <Dashes />

      <div className="text-center">
        <div className="text-[13px] font-bold tracking-[0.2em]">{isInvoice ? "INVOICE" : "RECEIPT"}</div>
      </div>
      <div className="mt-2 flex justify-between text-[11.5px]">
        <span>No. {doc.number}</span>
        <span>{formatDate(doc.issueDate)}</span>
      </div>
      {isInvoice && doc.dueDate && (
        <div className="flex justify-between text-[11.5px]">
          <span className="text-[#6b7280]">Due date</span>
          <span>{formatDate(doc.dueDate)}</span>
        </div>
      )}
      {(doc.customer.name || doc.customer.phone) && (
        <div className="mt-1 text-[11.5px]">
          <span className="text-[#6b7280]">Customer: </span>
          {[doc.customer.name, doc.customer.phone && formatNgPhone(doc.customer.phone)].filter(Boolean).join(" · ")}
        </div>
      )}

      <Dashes />

      {doc.items.map((item) => (
        <div key={item.id} className="py-1">
          <div className="break-words">{item.description}</div>
          <div className="flex justify-between text-[11.5px] tabular-nums">
            <span className="text-[#6b7280]">
              {formatQuantity(item.quantity)} × {formatNaira(item.unitPriceKobo)}
            </span>
            <span className="font-semibold text-[#111827]">{formatNaira(lineTotalKobo(item))}</span>
          </div>
        </div>
      ))}

      <Dashes />

      <div className="tabular-nums">
        {breakdownRows(doc, totals).map((r) => (
          <div key={r.label} className="flex justify-between">
            <span className="text-[#6b7280]">{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between text-[16px] font-extrabold">
          <span>TOTAL</span>
          <span>{formatNaira(totals.totalKobo)}</span>
        </div>
        {doc.status === "part" && (
          <>
            <div className="flex justify-between">
              <span className="text-[#6b7280]">Paid</span>
              <span>{formatNaira(totals.amountPaidKobo)}</span>
            </div>
            <div style={{ color: STATUS_COLOUR.part }} className="flex justify-between font-bold">
              <span>Balance</span>
              <span>{formatNaira(totals.balanceKobo)}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 text-center">
        <span
          style={{ color: STATUS_COLOUR[doc.status], borderColor: STATUS_COLOUR[doc.status] }}
          className="inline-block rounded border-2 px-3 py-0.5 text-[11px] font-bold tracking-widest"
        >
          {STATUS_LABEL[doc.status]}
        </span>
        {doc.status !== "unpaid" && (
          <div className="mt-1 text-[11px] text-[#6b7280]">
            {METHOD_LABEL[doc.method]}
            {doc.sourceInvoiceNumber && ` · for invoice ${doc.sourceInvoiceNumber}`}
          </div>
        )}
      </div>

      {showsBankDetails(doc, profile) && (
        <>
          <Dashes />
          <div className="text-center">
            <div className="text-[10.5px] font-semibold tracking-wider text-[#6b7280] uppercase">Pay to</div>
            <div className="text-[16px] font-bold tracking-wide tabular-nums">{profile.accountNumber}</div>
            <div className="text-[11.5px]">
              {profile.bankName}
              {profile.accountName && ` · ${profile.accountName}`}
            </div>
          </div>
        </>
      )}

      {doc.notes && (
        <>
          <Dashes />
          <div className="text-center text-[11.5px] whitespace-pre-line text-[#4b5563]">{doc.notes}</div>
        </>
      )}

      <div style={{ color: brandText }} className="mt-4 text-center text-[12px] font-semibold">
        Thank you!
      </div>
      {showFooterBrand && <div className="mt-2 text-center text-[9.5px] text-[#9ca3af]">Made with InCeipt</div>}
    </div>
  );
}
