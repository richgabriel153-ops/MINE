"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { MoneyInput } from "@/components/form/money-input";
import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatDate, lagosDate } from "@/lib/dates";
import { getProfile, listDocuments, listExpenses, listSales } from "@/lib/db";
import type { Expense } from "@/lib/expenses";
import { formatNaira } from "@/lib/money";
import type { DatedAmount } from "@/lib/profit";
import {
  computeTax,
  DEFAULT_TAX_PROFILE,
  outputVatFromDocuments,
  taxYears,
  type BusinessKind,
  type TaxProfile,
} from "@/lib/tax";
import { cn } from "@/lib/utils";

const PROFILE_KEY = "inceipt.tax-profile";

function loadTaxProfile(): TaxProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_TAX_PROFILE, ...(JSON.parse(raw) as Partial<TaxProfile>) } : DEFAULT_TAX_PROFILE;
  } catch {
    return DEFAULT_TAX_PROFILE;
  }
}

interface Data {
  sales: DatedAmount[];
  expenses: Expense[];
  outputVat: DatedAmount[];
  businessName: string;
}

const KINDS = [
  { value: "sole", label: "Sole trader" },
  { value: "company", label: "Company (Ltd)" },
] as const satisfies readonly { value: BusinessKind; label: string }[];

const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 py-1", strong && "border-t pt-2 font-semibold", muted && "text-muted-foreground")}>
      <dt>{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

export function TaxPanel() {
  const { access, showUpgrade } = useAccess();
  const [data, setData] = useState<Data | null>(null);
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const today = lagosDate();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [downloading, setDownloading] = useState(false);
  const allowed = access?.can.taxes ?? false;

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    Promise.all([listSales(), listExpenses(), listDocuments(), getProfile()])
      .then(([sales, expenses, docs, business]) => {
        if (!active) return;
        setProfile(loadTaxProfile());
        setData({ sales, expenses, outputVat: outputVatFromDocuments(docs), businessName: business.name });
      })
      .catch(() => active && toast.error("Couldn't load your records. Please try again."));
    return () => {
      active = false;
    };
  }, [allowed]);

  const update = (patch: Partial<TaxProfile>) => {
    setProfile((p) => {
      const next = { ...(p ?? DEFAULT_TAX_PROFILE), ...patch };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        // Private browsing: the settings just won't be remembered.
      }
      return next;
    });
  };

  const years = useMemo(() => (data ? taxYears([...data.sales, ...data.expenses].map((e) => e.date), today) : []), [data, today]);
  const categories = useMemo(() => [...new Set((data?.expenses ?? []).map((e) => e.category))].sort(), [data]);
  const report = useMemo(
    () =>
      data && profile
        ? computeTax(profile, {
            year,
            sales: data.sales,
            expenses: data.expenses.map((e) => ({ date: e.date, amountKobo: e.amountKobo, category: e.category })),
            outputVat: data.outputVat,
          })
        : null,
    [data, profile, year],
  );

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (access.role !== "owner")
    return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can see tax.</p>;
  if (!access.can.taxes)
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">
            Your tax accountant in your pocket. InCeipt Pro works out your income tax and VAT under the Nigeria Tax Act 2025 from
            your sales and expenses, shows your deadlines and prepares a tax report.
          </p>
          <Button onClick={() => showUpgrade("Tax")}>See Pro</Button>
        </CardContent>
      </Card>
    );
  if (!data || !profile || !report) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  const download = async () => {
    setDownloading(true);
    try {
      const { taxReportPdf } = await import("@/lib/tax-report-pdf");
      const blob = await taxReportPdf(report, data.businessName, today);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `InCeipt-tax-${report.year}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("Couldn't make the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {years.length > 1 && (
        <Segmented
          label="Tax year"
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          options={years.slice(0, 4).map((y) => ({ value: String(y), label: String(y) }))}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">Estimated tax for {report.year}</div>
          <div className="text-3xl font-extrabold tabular-nums">{formatNaira(report.totalTaxKobo)}</div>
          <div className="text-sm text-muted-foreground">
            {report.kind === "company" ? "Company income tax + development levy" : "Personal income tax"}
            {report.profitKobo > 0 && ` · ${report.effectiveRatePercent}% of profit`}
          </div>
          <div
            className={cn(
              "mt-3 rounded-lg px-3 py-2 text-sm",
              report.small ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            <strong>{report.small ? "Small business" : "Not a small business"}</strong>
            <ul className="mt-1 list-disc pl-4 text-foreground/80">
              {report.smallReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-semibold">About your business</h2>
          <Segmented label="Business type" value={profile.kind} onChange={(kind) => update({ kind })} options={KINDS} />
          <p className="-mt-2 text-xs text-muted-foreground">
            {profile.kind === "sole"
              ? "Registered as a business name (or not registered): you pay personal income tax on the profit."
              : "Registered as a limited company with CAC: the company pays company income tax."}
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Professional services
              <span className="block text-xs text-muted-foreground">Law, accounting, consulting, medical, etc.</span>
            </span>
            <Switch checked={profile.professionalServices} onCheckedChange={(v) => update({ professionalServices: v })} />
          </label>
          <Field id="assets" label="Value of equipment, vehicles and property" hint="Fixed assets the business owns.">
            <MoneyInput id="assets" value={profile.fixedAssetsKobo || null} onChange={(v) => update({ fixedAssetsKobo: v ?? 0 })} />
          </Field>
          {profile.kind === "sole" && (
            <div className="grid grid-cols-2 gap-3">
              <Field id="rent" label="Home rent paid" hint="20% relief, up to ₦500,000">
                <MoneyInput id="rent" value={profile.rentPaidKobo || null} onChange={(v) => update({ rentPaidKobo: v ?? 0 })} />
              </Field>
              <Field id="pension" label="Pension paid" optional>
                <MoneyInput id="pension" value={profile.pensionKobo || null} onChange={(v) => update({ pensionKobo: v ?? 0 })} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="other-income" label="Income not in InCeipt" optional>
              <MoneyInput id="other-income" value={profile.otherIncomeKobo || null} onChange={(v) => update({ otherIncomeKobo: v ?? 0 })} />
            </Field>
            <Field id="extra-costs" label="Costs not in InCeipt" optional>
              <MoneyInput id="extra-costs" value={profile.extraExpensesKobo || null} onChange={(v) => update({ extraExpensesKobo: v ?? 0 })} />
            </Field>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Expenses that are not business costs</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const off = profile.excludedCategories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={off}
                      onClick={() =>
                        update({
                          excludedCategories: off ? profile.excludedCategories.filter((x) => x !== c) : [...profile.excludedCategories, c],
                        })
                      }
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-sm",
                        off ? "border-destructive/40 bg-destructive/10 text-destructive line-through" : "bg-card",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-muted-foreground">Tap a category to leave it out (e.g. personal spending).</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-2 font-semibold">How it&apos;s worked out</h2>
          <dl className="text-sm">
            <Line label="Money received" value={formatNaira(report.grossReceiptsKobo)} />
            <Line label="Less VAT you charged" value={`−${formatNaira(report.outputVatKobo)}`} muted />
            {profile.otherIncomeKobo > 0 && <Line label="Other income" value={formatNaira(profile.otherIncomeKobo)} muted />}
            <Line label="Turnover" value={formatNaira(report.turnoverKobo)} strong />
            <Line label="Less business expenses" value={`−${formatNaira(report.expensesKobo)}`} muted />
            <Line label={report.profitKobo < 0 ? "Loss" : "Profit"} value={formatNaira(Math.abs(report.profitKobo))} strong />
            {report.company && (
              <>
                <Line label="Company income tax (30%)" value={formatNaira(report.company.citKobo)} />
                <Line label="Development levy (4%)" value={formatNaira(report.company.levyKobo)} />
              </>
            )}
            {report.personal && (
              <>
                <Line label="Less rent relief" value={`−${formatNaira(report.personal.rentReliefKobo)}`} muted />
                <Line label="Less pension" value={`−${formatNaira(report.personal.pensionKobo)}`} muted />
                <Line label="Chargeable income" value={formatNaira(report.personal.chargeableKobo)} strong />
                {report.personal.bands.map((b) => (
                  <Line key={b.label} label={`${b.label} at ${b.percent}%`} value={formatNaira(b.taxKobo)} />
                ))}
              </>
            )}
            <Line label="Estimated tax" value={formatNaira(report.totalTaxKobo)} strong />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="font-semibold">VAT (7.5%)</h2>
          <p className="text-sm text-muted-foreground">
            {report.vat.mustCharge
              ? "Your turnover is above the small business limit. Register for VAT, add 7.5% to your sales and file every month by the 21st."
              : "As a small business you don't have to charge VAT or file VAT returns."}
          </p>
          {report.vat.months.length > 0 && (
            <dl className="text-sm">
              {report.vat.months.map((m) => (
                <Line key={m.month} label={`${monthName(m.month)} · due ${formatDate(m.dueDate)}`} value={formatNaira(m.vatKobo)} />
              ))}
              <Line label="VAT charged this year" value={formatNaira(report.outputVatKobo)} strong />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="font-semibold">Deadlines</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {report.deadlines.map((d) => (
              <li key={d.label} className="flex justify-between gap-3">
                <span>{d.label}</span>
                <span className="shrink-0 font-medium">{/^\d{4}-/.test(d.date) ? formatDate(d.date) : d.date}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {report.notes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {report.notes.map((n) => (
            <li key={n} className="flex gap-2 rounded-xl border bg-card p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {n}
            </li>
          ))}
        </ul>
      )}

      <Button size="lg" onClick={download} disabled={downloading}>
        <Download /> {downloading ? "Preparing…" : "Download tax report (PDF)"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        An estimate from your InCeipt records under the Nigeria Tax Act 2025, not professional tax advice. Capital allowances and
        withholding tax credits aren&apos;t included. Confirm with a chartered tax practitioner before you file.
      </p>
    </div>
  );
}
