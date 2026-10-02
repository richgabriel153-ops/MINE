import type { Metadata } from "next";
import Link from "next/link";

import { EmailUs, LegalPage } from "@/components/legal/legal-page";
import { GRACE_DAYS, PLANS } from "@/lib/billing";
import { LEGAL } from "@/lib/legal";
import { formatNaira } from "@/lib/money";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" current="/terms">
      <p>
        These terms are an agreement between you and {LEGAL.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for your use of
        InCeipt, the website and app for making receipts, invoices and quotations (&ldquo;the service&rdquo;). By using InCeipt
        you agree to these terms. If you use InCeipt for a business, you confirm you are allowed to accept them for that
        business.
      </p>

      <h2>1. Who can use InCeipt</h2>
      <p>You must be at least 18 years old and able to enter into a binding contract under Nigerian law.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You can use InCeipt without an account. Your records are then saved only on your phone, and you are responsible for keeping a backup.</li>
        <li>If you create an account, you sign in with a code sent to your email. Keep access to your email secure; anyone who can read it can sign in.</li>
        <li>The person who creates a business account is its owner. The owner is responsible for the staff they invite and what those staff do in InCeipt, and can remove them at any time.</li>
        <li>Tell us straight away if you think someone has used your account without permission.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You must not use InCeipt to:</p>
      <ul>
        <li>make false, misleading or forged receipts, invoices or quotations, or deceive anyone;</li>
        <li>sell or collect payment for anything illegal, or break any law, including tax and consumer protection laws;</li>
        <li>add other people&apos;s personal information without the right to use it;</li>
        <li>try to access other people&apos;s accounts or data, interfere with the service, or get around limits or payments;</li>
        <li>copy, resell or reverse-engineer the service.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules, and report illegal activity to the authorities.</p>

      <h2>4. Your content</h2>
      <p>
        Your business details, logo, records and customer information belong to you. You give us permission to store, process
        and display them only to provide the service to you. You are responsible for the information you enter and for
        having the right to use it. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle personal
        information.
      </p>

      <h2>5. Calculations, tax estimates and the AI Assistant</h2>
      <ul>
        <li>InCeipt works out totals, VAT, discounts and balances from what you enter. Check your documents before sending them.</li>
        <li>
          The Tax page gives <strong>estimates</strong> based on our reading of the Nigeria Tax Act 2025 and the records in
          InCeipt. It is not professional tax, legal or accounting advice and does not include every rule, allowance or credit.
          Confirm with a qualified tax practitioner before filing or paying tax. You remain responsible for your tax returns.
        </li>
        <li>
          The InCeipt Assistant uses artificial intelligence and can make mistakes. It shows you what it plans to save and only
          saves it after you confirm, so check the details before you tap Confirm. Daily limits apply.
        </li>
      </ul>

      <h2>6. InCeipt Pro</h2>
      <ul>
        <li>
          InCeipt Pro costs {formatNaira(PLANS.monthly.kobo)} a month or {formatNaira(PLANS.yearly.kobo)} a year. Prices include
          any applicable taxes unless we say otherwise.
        </li>
        <li>
          Payment is taken by Paystack. Your plan <strong>renews automatically</strong> at the end of each month or year until
          you cancel.
        </li>
        <li>
          You can cancel at any time in More → InCeipt Pro. Pro stays on until the end of the period you&apos;ve paid for, and
          you won&apos;t be charged again.
        </li>
        <li>
          If a renewal payment fails, Pro keeps working for {GRACE_DAYS} days so you can update your card. After that, your
          account moves to the free plan. Your records are not deleted, but Pro-only features are locked until you subscribe
          again.
        </li>
        <li>If we change prices, we will tell you at least 30 days before the change affects your next renewal.</li>
        <li>Refunds are covered by our <Link href="/refunds">Refund Policy</Link>.</li>
        <li>
          Early-supporter unlock codes we issued before subscriptions remain honoured for the business that used them, as long
          as these terms are followed.
        </li>
      </ul>

      <h2>7. Getting paid online (Pay Now links)</h2>
      <ul>
        <li>
          Pay Now links are provided with Paystack. To use them you must also accept Paystack&apos;s terms, and Paystack may ask
          you for information to verify your business.
        </li>
        <li>
          Payments from your customers are settled by Paystack <strong>directly to the bank account you connect</strong>. We
          don&apos;t hold your money. Paystack deducts its transaction fees from each payment. If we charge a platform fee on
          these payments, we will show it before you turn Pay Now on.
        </li>
        <li>
          The sale is between you and your customer. You are responsible for delivering what you sold, handling complaints and
          refunds to your customers, and any chargebacks or disputes raised through Paystack.
        </li>
      </ul>

      <h2>8. Availability and changes</h2>
      <p>
        We work hard to keep InCeipt available, but we can&apos;t promise it will always be uninterrupted or error-free. We may
        improve, change or stop features. If we stop a paid feature you&apos;re using, we will give you reasonable notice and a
        fair refund for any paid period you can&apos;t use.
      </p>

      <h2>9. Closing your account</h2>
      <p>
        You can stop using InCeipt at any time and ask us to delete your account. We may suspend or close an account that
        breaks these terms, puts others at risk or is required to be closed by law. Where possible we will tell you first and
        give you a chance to save your records.
      </p>

      <h2>10. Our responsibility to you</h2>
      <p>
        InCeipt is provided &ldquo;as is&rdquo;. As far as the law allows, we are not responsible for indirect losses such as
        lost profits, lost sales or lost data, or for losses caused by information you entered, by your staff, or by services
        we don&apos;t control (such as banks, Paystack or your internet provider). Our total responsibility to you for any claim
        is limited to the amount you paid us for InCeipt in the 12 months before the claim. Nothing in these terms limits
        rights you have under Nigerian consumer protection law that can&apos;t be limited.
      </p>
      <p>
        You agree to cover our reasonable losses if a claim is made against us because of how you used InCeipt in breach of
        these terms or the law.
      </p>

      <h2>11. Law and disputes</h2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria. If you have a complaint, please <EmailUs />{" "}
        first so we can try to fix it. If we can&apos;t resolve it within 30 days, either of us may take it to the courts of Lagos
        State, Nigeria.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms. If the changes are important, we will tell you in the app or by email at least 14 days
        before they take effect. If you keep using InCeipt after that, you accept the new terms.
      </p>
    </LegalPage>
  );
}
