"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Gauge } from "lucide-react";

import { accessToken } from "@/lib/cloud/client";

/** Shown in More only for admins (the server decides, from ADMIN_EMAILS). */
export function AdminLink({ signedIn }: { signedIn: boolean }) {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    (async () => {
      const token = await accessToken();
      if (!token) return;
      const res = await fetch("/api/admin?view=check", { headers: { Authorization: `Bearer ${token}` } });
      const body = (await res.json().catch(() => ({}))) as { admin?: boolean };
      if (active) setAdmin(Boolean(body.admin));
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [signedIn]);

  if (!admin) return null;
  return (
    <Link
      href="/admin"
      className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-3 shadow-xs active:bg-muted"
    >
      <Gauge className="size-6 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Admin dashboard</span>
        <span className="block text-sm text-muted-foreground">Users, subscriptions and usage</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </Link>
  );
}
