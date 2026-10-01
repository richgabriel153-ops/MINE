"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, LayoutGrid, PlusCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/create", label: "New", icon: PlusCircle },
  { href: "/history", label: "History", icon: History },
  { href: "/more", label: "More", icon: LayoutGrid },
] as const;

/** Pages reached from the More tab. */
const MORE_PAGES = ["/profile", "/settings", "/account", "/signin", "/pro", "/quotes", "/expenses", "/profit", "/payouts", "/staff", "/activity", "/tax", "/assistant", "/admin"];

export function BottomNav() {
  const pathname = usePathname();
  // On phones the create form has its own sticky Save bar instead.
  const hideOnPhone = pathname === "/create";
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-safe md:sticky md:top-0 md:bottom-auto md:border-t-0 md:border-b",
        hideOnPhone && "max-md:hidden",
      )}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/more" && MORE_PAGES.some((p) => pathname.startsWith(p)));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors md:h-14 md:flex-row md:gap-2 md:text-sm",
                  active && "text-primary",
                )}
              >
                <Icon className="size-6 md:size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
