"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, FilePen, FilePlus, Settings, Trash2, UserCog, Wallet } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { listActivity, type ActivityEntry } from "@/lib/cloud/repo";
import { formatDate, lagosDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof FilePlus> = {
  create: FilePlus,
  edit: FilePen,
  delete: Trash2,
  delete_attempt: AlertTriangle,
  payment: Banknote,
  mark_paid: Banknote,
  convert: FilePlus,
  status: FilePen,
  staff_invite: UserCog,
  staff_deactivate: UserCog,
  staff_reactivate: UserCog,
  expense_create: Wallet,
  expense_edit: Wallet,
  expense_delete: Wallet,
  settings: Settings,
};

const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export function ActivityList() {
  const { access } = useAccess();
  const businessId = access?.cloud?.businessId;
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId || access?.role !== "owner") return;
    listActivity(businessId)
      .then((e) => {
        setEntries(e);
        setMore(e.length === 50);
      })
      .catch((e) => setError(e.message));
  }, [businessId, access?.role]);

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (access.role !== "owner") return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can see the activity log.</p>;
  if (error) return <p className="rounded-xl border bg-card p-4 text-sm">{error}</p>;
  if (entries === null) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (entries.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing yet.</p>;

  const days = entries.map((e) => lagosDate(new Date(e.created_at)));
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e, i) => {
        const at = new Date(e.created_at);
        const header = i === 0 || days[i] !== days[i - 1] ? formatDate(days[i]) : null;
        const Icon = ICONS[e.action] ?? FilePen;
        const warn = e.action === "delete_attempt" || e.action === "delete";
        const href = e.entity_id && ["receipt", "invoice", "quote"].includes(e.entity_type) && e.action !== "delete" ? `/view?id=${e.entity_id}` : null;
        const body = (
          <>
            <Icon className={cn("mt-0.5 size-5 shrink-0", warn ? "text-destructive" : "text-primary")} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <strong>{e.actor_name || "Someone"}</strong> {e.summary.charAt(0).toLowerCase() + e.summary.slice(1)}
              </div>
              <div className="text-xs text-muted-foreground">{timeFormatter.format(at)}</div>
            </div>
          </>
        );
        return (
          <div key={e.id}>
            {header && <h2 className="mt-2 mb-1 text-sm font-semibold text-muted-foreground">{header}</h2>}
            {href ? (
              <Link href={href} className="flex gap-3 rounded-xl border bg-card p-3 shadow-xs active:bg-muted">
                {body}
              </Link>
            ) : (
              <div className="flex gap-3 rounded-xl border bg-card p-3 shadow-xs">{body}</div>
            )}
          </div>
        );
      })}
      {more && (
        <Button
          variant="outline"
          onClick={async () => {
            if (!businessId) return;
            const next = await listActivity(businessId, entries.at(-1)?.id);
            setEntries([...entries, ...next]);
            setMore(next.length === 50);
          }}
        >
          Show older
        </Button>
      )}
    </div>
  );
}
