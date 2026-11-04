"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contact, History, Home, LayoutGrid, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: History },
  { href: "/create", label: "New", icon: Plus },
  { href: "/customers", label: "Customers", icon: Contact },
  { href: "/more", label: "More", icon: LayoutGrid },
] as const;

/** Pages reached from the More tab. */
const MORE_PAGES = ["/profile", "/settings", "/account", "/demo", "/pro", "/quotes", "/expenses", "/profit", "/payouts", "/staff", "/activity", "/tax", "/assistant", "/admin"];

export function BottomNav() {
  const pathname = usePathname();
  // On phones the create form has its own sticky Save bar instead.
  const hideOnPhone = pathname === "/create";
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-safe md:sticky md:top-0 md:bottom-auto md:border-t-0 md:border-b",
        hideOnPhone && "max-md:hidden",
      )}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/more" && MORE_PAGES.some((p) => pathname.startsWith(p)));
          const isNew = href === "/create";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground md:h-14 md:flex-row md:gap-2 md:text-sm",
                  active && "text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-11 items-center justify-center rounded-xl md:h-7 md:w-7 md:rounded-lg",
                    isNew && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="size-6 md:size-5" strokeWidth={isNew ? 2.6 : active ? 2.4 : 2} aria-hidden />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
