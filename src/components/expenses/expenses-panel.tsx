"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, LineChart, Plus } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, lagosDate, startOfMonth } from "@/lib/dates";
import { getExpenseCategories, listExpenses } from "@/lib/db";
import type { Expense } from "@/lib/expenses";
import { monthLabel } from "@/lib/history-filter";
import { formatNaira } from "@/lib/money";
import { ExpenseForm } from "./expense-form";

export function ExpensesPanel() {
  const { access, showUpgrade } = useAccess();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [custom, setCustom] = useState<string[]>([]);
  const [editing, setEditing] = useState<Expense | null | "new">(null);
  const allowed = access?.role === "owner";

  const load = useCallback(async () => {
    const [e, c] = await Promise.all([listExpenses(), getExpenseCategories()]);
    setExpenses(e);
    setCustom(c);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.all([listExpenses(), getExpenseCategories()])
      .then(([e, c]) => {
        if (!active) return;
        setExpenses(e);
        setCustom(c);
      })
      .catch(() => active && setExpenses([]));
    return () => {
      active = false;
    };
  }, [allowed]);

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

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (!allowed) return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can see expenses.</p>;

  const thisMonth = (expenses ?? []).filter((e) => e.date >= startOfMonth(lagosDate())).reduce((s, e) => s + e.amountKobo, 0);
  const add = () => (access.can.expenses ? setEditing("new") : showUpgrade("Expense tracking"));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Spent this month</div>
            <div className="text-xl font-bold tabular-nums">{formatNaira(thisMonth)}</div>
          </CardContent>
        </Card>
        <Button size="lg" onClick={add}>
          <Plus /> Add
        </Button>
      </div>
      <Link href="/profit" className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-xs">
        <LineChart className="size-5 text-primary" />
        <span className="flex-1 font-medium">See your profit</span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>
      {!access.can.expenses && expenses && expenses.length > 0 && (
        <p className="rounded-xl border border-highlight/50 bg-highlight/10 p-3 text-sm text-[#5a4210]">
          Your expenses are safe. Adding or changing them needs Pro.
        </p>
      )}

      {expenses === null ? (
        <p className="py-6 text-center text-muted-foreground">Loading…</p>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Log what you spend on stock, transport, fuel, rent and more to see your real profit.</p>
          <Button onClick={add}>
            <Plus /> Add your first expense
          </Button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <h2 className="flex justify-between text-sm font-semibold text-muted-foreground">
              <span>{g.label}</span>
              <span className="tabular-nums">{formatNaira(g.total)}</span>
            </h2>
            {g.items.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => (access.can.expenses ? setEditing(e) : showUpgrade("Expense tracking"))}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-xs active:bg-muted"
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
                <div className="font-semibold tabular-nums">{formatNaira(e.amountKobo)}</div>
              </button>
            ))}
          </section>
        ))
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
