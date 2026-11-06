import { DEFAULT_TAX_PROFILE, type TaxProfile } from "./tax";

const PROFILE_KEY = "inceipt.tax-profile";

/** The owner's tax answers (business type, rent, …), kept on this phone. */
export function loadTaxProfile(): TaxProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_TAX_PROFILE, ...(JSON.parse(raw) as Partial<TaxProfile>) } : DEFAULT_TAX_PROFILE;
  } catch {
    return DEFAULT_TAX_PROFILE;
  }
}

export function saveTaxProfile(profile: TaxProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Private browsing: the settings just won't be remembered.
  }
}
