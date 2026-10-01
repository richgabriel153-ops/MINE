"use client";

import { ProfileForm } from "@/components/profile/profile-form";
import { useProfile } from "@/hooks/use-profile";

export function ProfileLoader() {
  const [profile] = useProfile();
  if (!profile) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  return <ProfileForm initial={profile} />;
}
