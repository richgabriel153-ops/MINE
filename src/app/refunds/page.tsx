import type { Metadata } from "next";
import Link from "next/link";

import { EmailUs, LegalPage } from "@/components/legal/legal-page";
import { PLANS } from "@/lib/billing";
import { formatNaira } from "@/lib/money";

export const metadata: Metadata = { title: "Refund Policy" };

/** First-payment money-back window (days). */
const NEW_SUBSCRIBER_DAYS = 7;

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" current="/refunds">
      <p>
        This policy covers payments made to us for InCeipt Pro. Making receipts, invoices and quotations on the free plan
        costs nothing, so there is nothing to refund.
      </p>

      <h2>1. Cancelling InCeipt Pro</h2>
      <p>
        You can cancel at any time in More → InCeipt Pro. You won&apos;t be charged again, and Pro keeps working until the end
        of the month or year you&apos;ve already paid for. Your records stay safe on the free plan.
      </p>

      <h2>2. When we give a full refund</h2>
      <ul>
        <li>
          <strong>New subscribers:</strong> if InCeipt Pro isn&apos;t right for you, ask within {NEW_SUBSCRIBER_DAYS} days of
          your <strong>first</strong> payment ({formatNaira(PLANS.monthly.kobo)} monthly or {formatNaira(PLANS.yearly.kobo)}{" "}
          yearly) and we will refund it in full and end your Pro plan.
        </li>
        <li>
          <strong>Charged by mistake:</strong> a duplicate charge, a charge after you cancelled, or a charge for the wrong plan.
          Tell us within 30 days of the charge.
        </li>
        <li>
          <strong>Service problems:</strong> if a Pro feature you paid for was unavailable for a long period because of a
          problem on our side, we will refund the affected time.
        </li>
      </ul>

      <h2>3. When we don&apos;t give refunds</h2>
      <ul>
        <li>Unused days or months after you cancel (Pro stays on until the end of your paid period instead).</li>
        <li>Renewals you forgot to cancel, if you ask more than 7 days after the renewal date and have used Pro since.</li>
        <li>Accounts closed for breaking our <Link href="/terms">Terms of Service</Link>.</li>
        <li>Early-supporter unlock codes, which were not paid through InCeipt subscriptions.</li>
      </ul>

      <h2>4. How to ask for a refund</h2>
      <p>
        <EmailUs start /> with the email address on your InCeipt account, the date and amount of the payment, and the Paystack
        reference from your receipt email if you have it. We reply within 3 working days. Approved refunds are sent back to
        the card or account you paid with, through Paystack, and usually arrive within 5–10 working days depending on your
        bank.
      </p>

      <h2>5. Payments to businesses through Pay Now links</h2>
      <p>
        When a customer pays a business using a Pay Now link on an InCeipt invoice, the money goes directly to that
        business&apos;s bank account. We don&apos;t receive or hold it. If you paid a business and want a refund, please contact
        that business directly; their details are on the invoice. If you can&apos;t resolve it, you can raise a dispute with
        your bank or with Paystack.
      </p>

      <p>
        See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
