import type { Metadata } from "next";
import Link from "next/link";

import { EmailUs, LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" current="/privacy">
      <p>
        This policy explains what information InCeipt collects, why, who we share it with and the rights you have. InCeipt is
        operated by {LEGAL.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We follow the Nigeria Data Protection Act 2023
        (&ldquo;NDPA&rdquo;) and the regulations of the Nigeria Data Protection Commission (&ldquo;NDPC&rdquo;).
      </p>

      <h2>1. The short version</h2>
      <ul>
        <li>Without an account, your records are saved only on your phone. We never receive them.</li>
        <li>With an account, your records are stored securely online so you can use them on other phones and with staff.</li>
        <li>We never see card details. Payments are handled by Paystack.</li>
        <li>We don&apos;t sell your information, and we don&apos;t use your records for advertising.</li>
      </ul>

      <h2>2. Information we collect</h2>
      <h3>a) Using InCeipt without an account</h3>
      <p>
        Your business details, receipts, invoices, quotes, expenses and settings are stored in your phone&apos;s browser
        storage. They are not sent to us. If you clear your browser data or lose your phone, they can&apos;t be recovered unless
        you saved a backup. Your tax settings on the Tax page are also kept on your phone.
      </p>
      <h3>b) With an InCeipt account</h3>
      <ul>
        <li>
          <strong>Account details:</strong> your email address and the name you give us. We sign you in with a one-time code
          sent to your email; we don&apos;t store passwords.
        </li>
        <li>
          <strong>Business details:</strong> business name, logo, phone and WhatsApp numbers, address, email, Instagram handle,
          brand colour and the bank details you choose to print on your documents.
        </li>
        <li>
          <strong>Records:</strong> receipts, invoices, quotations, payments recorded against them, expenses (including any photo
          of a receipt you attach) and expense categories.
        </li>
        <li>
          <strong>Your customers&apos; details:</strong> the names and phone numbers you enter on documents. See section 4.
        </li>
        <li>
          <strong>Staff:</strong> the email addresses and names of people you invite, and an activity log of what each person
          did (for example &ldquo;created RCT-0012&rdquo;) so the owner can see it.
        </li>
      </ul>
      <h3>c) Payments</h3>
      <ul>
        <li>
          <strong>InCeipt Pro subscriptions</strong> are paid through Paystack. We receive your Paystack customer and
          subscription codes, the plan, the payment status and dates. We never receive or store card numbers or bank login
          details.
        </li>
        <li>
          <strong>Getting paid online (Pay Now links):</strong> to send payments to your bank, we collect your bank name, account
          number and the account name confirmed by Paystack, and Paystack creates a &ldquo;subaccount&rdquo; for you. When your
          customer pays, we receive the amount, date and transaction reference so your invoice updates. Your customer&apos;s
          payment details go to Paystack, not to us.
        </li>
      </ul>
      <h3>d) InCeipt Assistant (AI)</h3>
      <p>
        If you use the Assistant, the messages you type and the records it needs to answer you (for example a list of unpaid
        invoices) are sent to our AI provider, Anthropic, to produce a reply. We count how many messages each business sends
        and how much processing they use, to apply daily limits and manage costs. Anthropic does not use information sent
        through its commercial service to train its models by default. Don&apos;t type information into the Assistant that
        isn&apos;t needed for the task.
      </p>
      <h3>e) Technical information</h3>
      <p>
        Like most websites, our hosting provider keeps basic logs (such as IP address, device and browser type, and time of
        request) to keep the service secure and working. We use your IP address to apply limits on free previews. We don&apos;t
        use advertising trackers.
      </p>

      <h2>3. Why we use your information</h2>
      <ul>
        <li>To provide the service you asked for: storing records, making documents, staff access and online payments (performance of a contract).</li>
        <li>To take payment for InCeipt Pro and keep your plan up to date (performance of a contract).</li>
        <li>To keep InCeipt secure, prevent fraud and abuse, and fix problems (legitimate interests).</li>
        <li>To send essential messages such as sign-in codes and important service changes (performance of a contract).</li>
        <li>To meet legal, tax and accounting obligations (legal obligation).</li>
        <li>
          To understand how InCeipt is used, using counts and totals only (for example number of receipts made), to improve it
          (legitimate interests). Our admin dashboard never shows your customers&apos; details or the contents of your
          documents.
        </li>
      </ul>

      <h2>4. Your customers&apos; information</h2>
      <p>
        When you add a customer&apos;s name and phone number to a document, you decide what is collected and why, so you are the
        &ldquo;data controller&rdquo; for that information and we process it on your behalf, only to provide InCeipt to you. You
        should only add customer details you are allowed to use, and tell customers how you use them. If one of your customers
        contacts us, we will refer them to you and help you respond.
      </p>

      <h2>5. Who we share information with</h2>
      <p>We only share information with service providers that help us run InCeipt, under contracts that protect it:</p>
      <ul>
        <li><strong>Supabase</strong>: database, sign-in and file storage for accounts.</li>
        <li><strong>Paystack</strong>: subscriptions, Pay Now payments and payouts to your bank.</li>
        <li><strong>Anthropic</strong>: the AI that powers the InCeipt Assistant (only when you use it).</li>
        <li><strong>Vercel</strong>: website hosting.</li>
        <li><strong>Our email provider</strong>: sending sign-in codes.</li>
      </ul>
      <p>
        We may also share information if the law requires it, to protect people&apos;s safety or our legal rights, or as part
        of a sale or merger of our business (the new owner would have to follow this policy). We never sell personal
        information.
      </p>

      <h2>6. Storage outside Nigeria</h2>
      <p>
        Some of our providers store or process information outside Nigeria (for example in Europe or the United States). When
        this happens we rely on the safeguards allowed under the NDPA, such as the provider&apos;s contractual commitments to
        protect personal data to an adequate standard.
      </p>

      <h2>7. How long we keep information</h2>
      <ul>
        <li>Account records are kept while your account is active.</li>
        <li>
          If you ask us to delete your account, we delete your records within 30 days, except where we must keep some
          information for legal, tax or accounting reasons (for example records of payments made to us), which we keep only for
          as long as the law requires.
        </li>
        <li>Staff lose access as soon as the owner removes them; their past activity stays in the business&apos;s log.</li>
      </ul>

      <h2>8. Security</h2>
      <p>
        Information is encrypted in transit (HTTPS). Database rules make sure each person can only reach the businesses they
        belong to, and staff only see what the owner allows. Secret keys are kept on our servers, never in the app. No system
        is perfectly secure; if a breach affects your personal information, we will tell you and the NDPC as the law requires.
      </p>

      <h2>9. Your rights</h2>
      <p>Under the NDPA you can ask us to:</p>
      <ul>
        <li>give you a copy of the personal information we hold about you;</li>
        <li>correct information that is wrong or incomplete;</li>
        <li>delete your information;</li>
        <li>restrict or object to how we use it;</li>
        <li>give you your information in a common format to move it elsewhere;</li>
        <li>withdraw consent where we rely on it.</li>
      </ul>
      <p>
        To use these rights, <EmailUs />. We will reply within 30 days. You can also complain to the Nigeria Data Protection
        Commission (ndpc.gov.ng).
      </p>

      <h2>10. Children</h2>
      <p>InCeipt is for businesses and is not meant for anyone under 18.</p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy. If the changes are important, we will tell you in the app or by email before they take
        effect. The date at the top shows when it last changed.
      </p>

      <p>
        See also our <Link href="/terms">Terms of Service</Link> and <Link href="/refunds">Refund Policy</Link>.
      </p>
    </LegalPage>
  );
}
