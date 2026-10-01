import { randomBytes } from "node:crypto";

import { checkPayAmount, isValidEmail } from "@/lib/pay-amount";
import { invoiceForToken, recordOnlinePayment, subaccountFor } from "@/lib/server/pay-links";
import { appOrigin, isPaystackConfigured, paystack, PaystackError } from "@/lib/server/paystack";
import { isServerCloudConfigured, json } from "@/lib/server/supabase-admin";

/**
 * Public Pay Now endpoint used by the customer's /pay page.
 *   GET  ?t=<link code>[&reference=<paystack ref>] → invoice summary (and confirms a payment on return)
 *   POST { t, email, amountKobo } → Paystack payment page URL. The money goes to the business's subaccount.
 */
export async function GET(request: Request) {
  if (!isServerCloudConfigured()) return json({ error: "Online payment isn't available right now." }, 503);
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  let invoice = await invoiceForToken(token);
  if (!invoice) return json({ error: "This payment link isn't valid." }, 404);

  let justPaid = false;
  if (reference && isPaystackConfigured()) {
    try {
      const tx = await paystack<Record<string, unknown>>(`/transaction/verify/${encodeURIComponent(reference)}`);
      const meta = (tx.metadata ?? {}) as { document_id?: string };
      if (tx.status === "success" && meta.document_id === invoice.documentId) {
        await recordOnlinePayment(tx);
        justPaid = true;
        invoice = (await invoiceForToken(token)) ?? invoice;
      }
    } catch {
      // The webhook will still record it.
    }
  }
  const { businessId, documentId, ...publicInvoice } = invoice;
  void businessId;
  void documentId;
  return json({ invoice: publicInvoice, justPaid });
}

export async function POST(request: Request) {
  if (!isServerCloudConfigured() || !isPaystackConfigured()) return json({ error: "Online payment isn't available right now." }, 503);
  let body: { t?: string; email?: string; amountKobo?: number } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const invoice = await invoiceForToken(body.t ?? "");
  if (!invoice) return json({ error: "This payment link isn't valid." }, 404);
  const email = (body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return json({ error: "Enter your email address for your payment receipt." }, 400);
  const amount = Number(body.amountKobo);
  const problem = checkPayAmount(amount, invoice.balanceKobo);
  if (problem) return json({ error: invoice.balanceKobo === 0 ? "This invoice is already paid. Thank you!" : problem }, 400);
  const subaccount = await subaccountFor(invoice.businessId);
  if (!subaccount) return json({ error: "This business can't take online payments right now." }, 409);

  try {
    const reference = `INC-${invoice.number}-${randomBytes(5).toString("hex")}`;
    const init = await paystack<{ authorization_url: string }>("/transaction/initialize", {
      body: {
        email,
        amount,
        reference,
        subaccount,
        // The business receives the payment; Paystack's fee comes out of it.
        bearer: "subaccount",
        channels: ["card", "bank", "ussd", "bank_transfer"],
        callback_url: `${appOrigin(request)}/pay?t=${encodeURIComponent(body.t!)}`,
        metadata: {
          kind: "invoice_payment",
          document_id: invoice.documentId,
          business_id: invoice.businessId,
          invoice_number: invoice.number,
          custom_fields: [{ display_name: "Invoice", variable_name: "invoice", value: `${invoice.number} (${invoice.businessName})` }],
        },
      },
    });
    return json({ url: init.authorization_url });
  } catch (err) {
    console.error("pay init", err);
    return json({ error: err instanceof PaystackError ? err.message : "Couldn't start the payment. Please try again." }, 502);
  }
}
