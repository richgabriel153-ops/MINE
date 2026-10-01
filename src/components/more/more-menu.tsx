"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Calculator,
  ChevronRight,
  ClipboardList,
  FileText,
  Landmark,
  LineChart,
  ShieldCheck,
  Store,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import { ProLock, useAccess } from "@/components/access/access-provider";
import { AdminLink } from "@/components/admin/admin-link";
import type { Permissions } from "@/lib/permissions";

interface Item {
  href: string;
  label: string;
  text: string;
  icon: typeof Store;
  /** Shown only if this permission is true (owner-only things are hidden from staff). */
  show?: (can: Permissions, mode: "local" | "cloud", role: "owner" | "staff") => boolean;
  /** Pro feature: shown with a lock for free users. */
  pro?: (can: Permissions) => boolean;
  /** Needs an account. */
  cloudOnly?: boolean;
}

const ITEMS: Item[] = [
  { href: "/account", label: "Account", text: "Sign in, switch business", icon: UserRound },
  { href: "/profile", label: "Business details", text: "Logo, contacts, bank, colour", icon: Store, show: (_c, _m, r) => r === "owner" },
  { href: "/quotes", label: "Quotations", text: "Quotes and proforma invoices", icon: FileText, pro: (c) => c.quotes },
  { href: "/expenses", label: "Expenses", text: "Log what you spend", icon: Wallet, show: (_c, _m, r) => r === "owner", pro: (c) => c.expenses },
  { href: "/profit", label: "Profit", text: "Sales, expenses and profit", icon: LineChart, show: (_c, _m, r) => r === "owner", pro: (c) => c.expenses },
  { href: "/tax", label: "Tax", text: "Income tax, VAT and deadlines", icon: Calculator, show: (_c, _m, r) => r === "owner", pro: (c) => c.taxes },
  { href: "/payouts", label: "Get paid online", text: "Pay Now links on invoices", icon: Landmark, show: (_c, _m, r) => r === "owner", pro: (c) => c.payLinks, cloudOnly: true },
  { href: "/staff", label: "Staff", text: "Invite people to help you", icon: Users, show: (_c, _m, r) => r === "owner", pro: (c) => c.manageStaff, cloudOnly: true },
  { href: "/activity", label: "Activity log", text: "Who did what, and when", icon: ClipboardList, show: (_c, _m, r) => r === "owner", pro: (c) => c.manageStaff, cloudOnly: true },
  { href: "/settings", label: "Backup", text: "Save or restore your records", icon: ShieldCheck, show: (_c, m) => m === "local" },
  { href: "/pro", label: "InCeipt Pro", text: "Plans and billing", icon: BadgeCheck, show: (_c, _m, r) => r === "owner" },
];

export function MoreMenu() {
  const { access, showUpgrade } = useAccess();
  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  return (
    <ul className="flex flex-col gap-2">
      {ITEMS.filter((i) => !i.show || i.show(access.can, access.mode, access.role)).map((item) => {
        const locked = item.pro ? !item.pro(access.can) : false;
        const needsAccount = item.cloudOnly && access.mode === "local";
        const body = (
          <>
            <item.icon className="size-6 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-semibold">
                {item.label} {item.pro && locked && <ProLock />}
              </span>
              <span className="block text-sm text-muted-foreground">
                {needsAccount && !locked ? "Needs a free InCeipt account" : item.text}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </>
        );
        const cls = "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-xs active:bg-muted";
        return (
          <li key={item.href}>
            {locked ? (
              <button type="button" className={cls} onClick={() => showUpgrade(item.label)}>
                {body}
              </button>
            ) : (
              <Link href={needsAccount ? `/account?next=${encodeURIComponent(item.href)}` : item.href} className={cls}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
      <li>
        <AdminLink signedIn={access.mode === "cloud"} />
      </li>
    </ul>
  );
}
