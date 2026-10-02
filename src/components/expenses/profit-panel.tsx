"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, lagosDate } from "@/lib/dates";
import { listDocuments, listExpenses, listSales } from "@/lib/db";
import type { Expense } from "@/lib/expenses";
import { formatNaira } from "@/lib/money";
import { byCategory, monthlySeries, profitFor, rangeFor, type PeriodKey, type Range } from "@/lib/profit";
import { owingKobo } from "@/lib/summary";
import { SalesExpensesChart } from "./sales-expenses-chart";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
] as const satisfies readonly { value: PeriodKey; label: string }[];

interface Data {
  sales: { date: string; amountKobo: number }[];
  expenses: Expense[];
  owingKobo: number;
}

export function ProfitPanel() {
  const { access, showUpgrade } = useAccess();
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const today = lagosDate();
  const [custom, setCustom] = useState<Range>({ from: today.slice(0, 8) + "01", to: today });
  const allowed = access?.role === "owner" && access.can.expenses;

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.all([listSales(), listExpenses(), listDocuments()])
      .then(([sales, expenses, docs]) => {
        if (active) setData({ sales, expenses, owingKobo: docs.reduce((s, d) => s + owingKobo(d), 0) });
      })
      .catch(() => active && setData({ sales: [], expenses: [], owingKobo: 0 }));
    return () => {
      active = false;
    };
  }, [allowed]);

  const range = period === "custom" ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }) : rangeFor(period, today);
  const expenseAmounts = useMemo(() => (data?.expenses ?? []).map((e) => ({ date: e.date, amountKobo: e.amountKobo, category: e.category })), [data]);
  const summary = data ? profitFor(data.sales, expenseAmounts, range) : null;
  const series = useMemo(() => (data ? monthlySeries(data.sales, expenseAmounts, today) : []), [data, expenseAmounts, today]);
  const categories = data ? byCategory(expenseAmounts, range) : [];

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (access.role !== "owner") return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can see profit.</p>;
  if (!access.can.expenses)
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">See your sales, expenses and real profit by day, week or month with InCeipt Pro.</p>
          <Button onClick={() => showUpgrade("Profit")}>See Pro</Button>
        </CardContent>
      </Card>
    );
  if (!data || !summary) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  const loss = summary.profitKobo < 0;
  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      {period === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field id="from" label="From">
            <Input id="from" type="date" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          </Field>
          <Field id="to" label="To">
            <Input id="to" type="date" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </Field>
        </div>
      ) : (
        <p className="-mt-2 text-sm text-muted-foreground">
          {range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(range.to)}`}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">{loss ? "Loss" : "Profit"}</div>
          <div className={`text-3xl font-extrabold tabular-nums ${loss ? "text-destructive" : ""}`}>
            {formatNaira(Math.abs(summary.profitKobo))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm tabular-nums">
            <div>
              <dt className="text-muted-foreground">Sales received</dt>
              <dd className="text-lg font-semibold">{formatNaira(summary.salesKobo)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expenses</dt>
              <dd className="text-lg font-semibold">{formatNaira(summary.expensesKobo)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Link href="/history?status=owing" className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <Info className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm">
          Customers still owe you <strong className="tabular-nums">{formatNaira(data.owingKobo)}</strong>. This isn&apos;t
          counted as profit until it&apos;s paid.
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="font-semibold">Sales vs expenses, last 6 months</h2>
          <SalesExpensesChart data={series} />
        </CardContent>
      </Card>

      {categories.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="font-semibold">Where the money went</h2>
            <ul className="flex flex-col gap-1.5 text-sm tabular-nums">
              {categories.map((c) => (
                <li key={c.category} className="flex justify-between">
                  <span>{c.category}</span>
                  <span className="font-medium">{formatNaira(c.amountKobo)}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="link" className="h-8 self-start px-0">
              <Link href="/expenses">See all expenses</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <p className="text-center text-xs text-muted-foreground">Sales count only money actually received, on the day it was paid.</p>
    </div>
  );
}
