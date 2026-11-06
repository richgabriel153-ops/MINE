"use client";

import { useEffect, useState } from "react";

import { getProfile } from "@/lib/db";
import type { BusinessProfile } from "@/lib/types";

/** The saved business profile, or null while it is loading. */
export function useProfile() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  useEffect(() => {
    let active = true;
    getProfile().then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, []);
  return [profile, setProfile] as const;
}
