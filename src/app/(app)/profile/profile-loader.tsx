"use client";

import { useAccess } from "@/components/access/access-provider";
import { ProfileForm } from "@/components/profile/profile-form";
import { useProfile } from "@/hooks/use-profile";

export function ProfileLoader() {
  const [profile] = useProfile();
  const { access } = useAccess();
  if (access && !access.can.manageBusiness)
    return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can change these details.</p>;
  if (!profile) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  return <ProfileForm initial={profile} />;
}
