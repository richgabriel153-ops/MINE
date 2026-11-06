"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, LineChart, Plus } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, lagosDate, startOfMonth } from "@/lib/dates";
import { expensesSince, getExpenseCategories, listExpensesPage } from "@/lib/db";
import type { Expense } from "@/lib/expenses";
import { monthLabel } from "@/lib/history-filter";
import { formatNaira } from "@/lib/money";
import { ExpenseForm } from "./expense-form";

const PAGE = 50;

const firstLoad = () => Promise.all([listExpensesPage(0, PAGE), expensesSince(startOfMonth(lagosDate())), getExpenseCategories()]);

export function ExpensesPanel() {
  const { access, showUpgrade } = useAccess();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [custom, setCustom] = useState<string[]>([]);
  const [editing, setEditing] = useState<Expense | null | "new">(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [thisMonth, setThisMonth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = access?.role === "owner";

  /** First page, this month's total and the categories. */
  const apply = useCallback(([page, month, c]: Awaited<ReturnType<typeof firstLoad>>) => {
    setExpenses(page.expenses);
    setHasMore(page.hasMore);
    setThisMonth(month);
    setCustom(c);
    setError(null);
  }, []);
  const load = useCallback(() => firstLoad().then(apply), [apply]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    firstLoad()
      .then((r) => active && apply(r))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Couldn't load your expenses."));
    return () => {
      active = false;
    };
  }, [allowed, apply]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const page = await listExpensesPage(expenses?.length ?? 0, PAGE);
      setExpenses((prev) => [...(prev ?? []), ...page.expenses]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = useMemo(() => {
    const g: { key: string; label: string; total: number; items: Expense[] }[] = [];
    for (const e of expenses ?? []) {
      const key = e.date.slice(0, 7);
      const last = g.at(-1);
      if (last?.key === key) {
        last.items.push(e);
        last.total += e.amountKobo;
      } else g.push({ key, label: monthLabel(e.date), total: e.amountKobo, items: [e] });
    }
    return g;
  }, [expenses]);

  if (!access)
    return (
      <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
        ))}
      </ul>
    );
  if (!allowed) return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can see expenses.</p>;

  const add = () => (access.can.expenses ? setEditing("new") : showUpgrade("Expense tracking"));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Spent this month</div>
            <div className="text-xl font-bold amount">{thisMonth === null ? "…" : formatNaira(thisMonth)}</div>
          </CardContent>
        </Card>
        <Button size="lg" onClick={add}>
          <Plus /> Add
        </Button>
      </div>
      <Link href="/profit" className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
        <LineChart className="size-5 text-primary" />
        <span className="flex-1 font-medium">See your profit</span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>
      {!access.can.expenses && expenses && expenses.length > 0 && (
        <p className="rounded-xl border border-highlight/50 bg-highlight/10 p-3 text-sm text-[#7a2e0e]">
          Your expenses are safe. Adding or changing them needs Pro.
        </p>
      )}

      {error && expenses === null ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
          <p>Couldn&apos;t load your expenses. {error}</p>
          <Button variant="outline" onClick={() => void load().catch(() => {})}>
            Try again
          </Button>
        </div>
      ) : expenses === null ? (
        <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </ul>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Log what you spend on stock, transport, fuel, rent and more to see your real profit.</p>
          <Button onClick={add}>
            <Plus /> Add your first expense
          </Button>
        </div>
      ) : (
        groups.map((g, i) => (
          <section key={g.key} className="flex flex-col gap-2">
            <h2 className="flex justify-between text-sm font-semibold text-muted-foreground">
              <span>{g.label}</span>
              {/* The last month may continue on the next page, so its total would be short. */}
              {!(hasMore && i === groups.length - 1) && <span className="amount">{formatNaira(g.total)}</span>}
            </h2>
            {g.items.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => (access.can.expenses ? setEditing(e) : showUpgrade("Expense tracking"))}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left active:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {e.category} {(e.photo || e.photoPath) && <Camera className="size-4 text-muted-foreground" aria-label="Has photo" />}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {formatDate(e.date)}
                    {e.note && ` · ${e.note}`}
                  </div>
                </div>
                <div className="font-semibold amount">{formatNaira(e.amountKobo)}</div>
              </button>
            ))}
          </section>
        ))
      )}
      {hasMore && (
        <Button variant="outline" size="lg" onClick={() => void more()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}

      {editing !== null && (
        <ExpenseForm
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          expense={editing === "new" ? null : editing}
          customCategories={custom}
          onCategoriesChanged={setCustom}
          onSaved={load}
        />
      )}
    </div>
  );
}
