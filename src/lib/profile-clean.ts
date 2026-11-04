import type { BusinessProfile } from "./types";

/** Make old phone-saved business details acceptable to the server's checks (drop what can't be fixed). */
export function cleanProfileForUpload(p: BusinessProfile): BusinessProfile {
  const cut = (v: string) => (v ?? "").trim().slice(0, 200);
  const digits = (p.accountNumber ?? "").replace(/\D/g, "");
  return {
    ...p,
    name: cut(p.name),
    phone: cut(p.phone),
    whatsapp: cut(p.whatsapp),
    address: cut(p.address),
    email: cut(p.email),
    bankName: cut(p.bankName),
    accountName: cut(p.accountName),
    instagram: cut(p.instagram),
    accountNumber: digits.length === 10 ? digits : "",
    brandColor: /^#[0-9a-fA-F]{6}$/.test(p.brandColor ?? "") ? p.brandColor : "#0b5f5a",
    logo: /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(p.logo ?? "") && p.logo.length < 350_000 ? p.logo : "",
  };
}
