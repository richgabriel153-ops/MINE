"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { PhoneInput } from "@/components/form/phone-input";
import { ColourPicker } from "@/components/profile/colour-picker";
import { LogoUpload } from "@/components/profile/logo-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NIGERIAN_BANKS } from "@/lib/banks";
import { saveProfile } from "@/lib/db";
import { cleanInstagram, validateProfile, type ProfileErrors } from "@/lib/profile";
import type { BusinessProfile } from "@/lib/types";

/** Only allow going back to our own pages after saving. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function ProfileForm({ initial }: { initial: BusinessProfile }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [profile, setProfile] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [badPhones, setBadPhones] = useState({ phone: false, whatsapp: false });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: BusinessProfile = {
      ...profile,
      name: profile.name.trim(),
      address: profile.address.trim(),
      email: profile.email.trim(),
      bankName: profile.bankName.trim(),
      accountName: profile.accountName.trim(),
      instagram: cleanInstagram(profile.instagram),
    };
    const found = validateProfile(cleaned);
    if (badPhones.phone) found.phone = "Enter a Nigerian mobile number, e.g. 0803 123 4567.";
    if (badPhones.whatsapp) found.whatsapp = "Enter a Nigerian mobile number, e.g. 0803 123 4567.";
    setErrors(found);
    const firstError = Object.keys(found).find((k) => found[k as keyof BusinessProfile]);
    if (firstError) {
      document.getElementById(`profile-${firstError}`)?.focus();
      toast.error("Please check the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      await saveProfile(cleaned);
      setProfile(cleaned);
      toast.success("Business details saved");
      if (next) router.push(next);
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Your business</CardTitle>
          <CardDescription>This shows at the top of every receipt.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LogoUpload value={profile.logo} onChange={(v) => set("logo", v)} />
          <Field id="profile-name" label="Business name" error={errors.name}>
            <Input
              id="profile-name"
              value={profile.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Ada's Fashion House"
              autoComplete="organization"
              aria-invalid={!!errors.name || undefined}
              maxLength={80}
            />
          </Field>
          <Field id="profile-phone" label="Phone number" optional error={errors.phone}>
            <PhoneInput
              id="profile-phone"
              value={profile.phone}
              onChange={(v) => set("phone", v)}
              invalid={!!errors.phone}
              onValidityChange={(ok) => {
                setBadPhones((b) => ({ ...b, phone: !ok }));
                if (ok) setErrors((e) => ({ ...e, phone: undefined }));
              }}
            />
          </Field>
          <Field id="profile-whatsapp" label="WhatsApp number" optional error={errors.whatsapp}>
            <PhoneInput
              id="profile-whatsapp"
              value={profile.whatsapp}
              onChange={(v) => set("whatsapp", v)}
              invalid={!!errors.whatsapp}
              onValidityChange={(ok) => {
                setBadPhones((b) => ({ ...b, whatsapp: !ok }));
                if (ok) setErrors((e) => ({ ...e, whatsapp: undefined }));
              }}
            />
            {profile.phone && profile.whatsapp !== profile.phone && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-8 self-start px-0"
                onClick={() => {
                  set("whatsapp", profile.phone);
                  setBadPhones((b) => ({ ...b, whatsapp: false }));
                }}
              >
                Same as phone number
              </Button>
            )}
          </Field>
          <Field id="profile-address" label="Address" optional>
            <Textarea
              id="profile-address"
              rows={2}
              value={profile.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="e.g. Shop 12, Balogun Market, Lagos"
              autoComplete="street-address"
              maxLength={160}
            />
          </Field>
          <Field id="profile-email" label="Email" optional error={errors.email}>
            <Input
              id="profile-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={profile.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@example.com"
              aria-invalid={!!errors.email || undefined}
            />
          </Field>
          <Field id="profile-instagram" label="Instagram" optional>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">@</span>
              <Input
                id="profile-instagram"
                className="pl-7"
                autoCapitalize="none"
                autoCorrect="off"
                value={profile.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                placeholder="yourshop"
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>Shown on invoices so customers know where to pay.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field id="profile-bankName" label="Bank name" optional>
            <Input
              id="profile-bankName"
              list="bank-list"
              value={profile.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              placeholder="e.g. GTBank, OPay, Moniepoint"
              autoComplete="off"
            />
            <datalist id="bank-list">
              {NIGERIAN_BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field id="profile-accountNumber" label="Account number" optional error={errors.accountNumber}>
            <Input
              id="profile-accountNumber"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={profile.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value.replace(/\D/g, ""))}
              placeholder="10 digits"
              className="tabular-nums tracking-wider"
              aria-invalid={!!errors.accountNumber || undefined}
            />
          </Field>
          <Field id="profile-accountName" label="Account name" optional>
            <Input
              id="profile-accountName"
              value={profile.accountName}
              onChange={(e) => set("accountName", e.target.value)}
              placeholder="Name on the account"
              autoComplete="off"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand colour</CardTitle>
          <CardDescription>Used for headings on your receipts.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColourPicker value={profile.brandColor} onChange={(v) => set("brandColor", v)} />
        </CardContent>
      </Card>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {saving ? "Saving…" : next ? "Save and continue" : "Save business details"}
        </Button>
      </div>
    </form>
  );
}
