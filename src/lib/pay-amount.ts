/** Smallest online payment we accept (Paystack's minimum charge is ₦50 for NGN). */
export const MIN_ONLINE_PAYMENT_KOBO = 10_000; // ₦100

/** Check an amount a customer chose to pay. Returns an error message, or null if OK. */
export function checkPayAmount(amountKobo: number, balanceKobo: number): string | null {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) return "Enter an amount to pay.";
  if (amountKobo > balanceKobo) return "That's more than the amount due.";
  if (amountKobo < Math.min(MIN_ONLINE_PAYMENT_KOBO, balanceKobo)) return "The smallest online payment is ₦100.";
  return null;
}

/** Customers need an email for Paystack's receipt. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
