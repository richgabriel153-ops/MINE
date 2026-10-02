"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadAccess, type Access } from "@/lib/access";
import { OWNER_ONLY_MESSAGE } from "@/lib/permissions";
import { usePreviewMode } from "@/lib/preview";

interface AccessContextValue {
  /** null while loading */
  access: Access | null;
  reload: () => Promise<void>;
  /** Returns true if Pro; otherwise shows the upgrade prompt for `feature` and returns false. */
  requirePro: (feature: string) => boolean;
  /** Shows the "Upgrade to Pro" prompt. */
  showUpgrade: (feature: string) => void;
  /** Shows "only the owner can do this". */
  showOwnerOnly: (what?: string) => void;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [ownerOnly, setOwnerOnly] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setAccess(await loadAccess());
  }, []);

  useEffect(() => {
    let active = true;
    loadAccess().then((a) => {
      if (active) setAccess(a);
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AccessContextValue>(
    () => ({
      access,
      reload,
      requirePro: (feature) => {
        if (access?.isPro) return true;
        setUpgradeFeature(feature);
        return false;
      },
      showUpgrade: (feature) => setUpgradeFeature(feature),
      showOwnerOnly: (what) => setOwnerOnly(what ?? OWNER_ONLY_MESSAGE),
    }),
    [access, reload],
  );

  const pathname = usePathname();
  const preview = usePreviewMode();
  const showBlocked = access?.blocked && !["/account", "/signin"].includes(pathname);

  return (
    <AccessContext.Provider value={value}>
      {showBlocked ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <Lock className="size-6 text-muted-foreground" />
          </span>
          <p className="max-w-sm">{access.blocked}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw /> Try again
            </Button>
            <Button asChild>
              <Link href="/account">Account</Link>
            </Button>
          </div>
        </div>
      ) : (
        children
      )}
      <Dialog open={upgradeFeature !== null} onOpenChange={(o) => !o && setUpgradeFeature(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-highlight/20 text-[#5a4210]">
              <Lock className="size-5" />
            </span>
            <DialogTitle>{upgradeFeature} is a Pro feature</DialogTitle>
            <DialogDescription>
              Upgrade to InCeipt Pro to unlock it, along with the AI assistant, tax estimates, debt tracking, quotations,
              expenses and profit, staff accounts and Pay Now links. From ₦3,000 a month.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button asChild size="lg" onClick={() => setUpgradeFeature(null)}>
              <Link href="/pro">
                <Sparkles /> Upgrade to Pro
              </Link>
            </Button>
            {preview?.enabled && access?.mode === "local" && (
              <Button asChild variant="outline" onClick={() => setUpgradeFeature(null)}>
                <Link href="/demo">Try the Pro preview (test link)</Link>
              </Button>
            )}
            <Button variant="ghost" onClick={() => setUpgradeFeature(null)}>
              Not now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={ownerOnly !== null} onOpenChange={(o) => !o && setOwnerOnly(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Owner only</DialogTitle>
            <DialogDescription>{ownerOnly}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOwnerOnly(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used inside AccessProvider");
  return ctx;
}

/** Small amber lock badge shown next to Pro-only controls. */
export function ProLock({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded bg-highlight/25 px-1 py-px text-[9px] font-bold text-[#5a4210] ${className ?? ""}`}
    >
      <Lock className="size-2.5" aria-hidden />
      PRO
    </span>
  );
}
