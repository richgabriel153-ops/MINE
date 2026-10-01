import { createHmac, timingSafeEqual } from "node:crypto";

/** Paystack signs each webhook body with HMAC-SHA512 using your secret key (x-paystack-signature). */
export function isValidPaystackSignature(rawBody: string, signature: string | null, secretKey: string | undefined): boolean {
  if (!signature || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
