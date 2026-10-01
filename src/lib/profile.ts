import type { BusinessProfile } from "./types";

export type ProfileErrors = Partial<Record<keyof BusinessProfile, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check a profile before saving. Phone fields are already normalised by PhoneInput. */
export function validateProfile(p: BusinessProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  if (p.name.trim() === "") errors.name = "Please enter your business name.";
  if (p.email.trim() !== "" && !EMAIL.test(p.email.trim())) errors.email = "This email doesn't look right.";
  if (p.accountNumber !== "" && !/^\d{10}$/.test(p.accountNumber))
    errors.accountNumber = "Account numbers have 10 digits.";
  if (!/^#[0-9a-f]{6}$/i.test(p.brandColor)) errors.brandColor = "Pick a colour.";
  return errors;
}

/** "@my.shop" / "instagram.com/my.shop" / "my.shop" → "my.shop" */
export function cleanInstagram(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
}

export function hasBankDetails(p: BusinessProfile): boolean {
  return p.bankName.trim() !== "" && p.accountNumber.trim() !== "";
}
