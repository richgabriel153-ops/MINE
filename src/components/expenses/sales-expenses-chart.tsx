"use client";

import { useState } from "react";

import { formatNaira } from "@/lib/money";
import { niceTicks, shortNaira, type MonthBar } from "@/lib/profit";

/** Validated pair (light surface): passes lightness, chroma, colour-blind separation and contrast checks. */
const SALES = "#5560c4";
const EXPENSES = "#c27a16";

const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** Grouped columns: money received vs money spent per month, one ₦ axis. Tap a bar for its value. */
export function SalesExpensesChart({ data }: { data: MonthBar[] }) {
  const [active, setActive] = useState<{ i: number; series: "sales" | "expenses" } | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...data.flatMap((d) => [d.salesKobo, d.expensesKobo]));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;

  const W = 340;
  const H = 180;
  const padL = 44;
  const padB = 22;
  const padT = 8;
  const plotW = W - padL - 4;
  const plotH = H - padB - padT;
  const group = plotW / data.length;
  const bar = Math.min(16, (group - 14) / 2);
  const y = (kobo: number) => padT + plotH - (kobo / top) * plotH;

  function column(x: number, value: number, colour: string, i: number, series: "sales" | "expenses") {
    const h = Math.max(0, (value / top) * plotH);
    const r = Math.min(4, h / 2, bar / 2);
    const yTop = padT + plotH - h;
    // Rounded top, square at the baseline.
    const d =
      h <= 0
        ? ""
        : `M${x},${padT + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + bar - r} Q${x + bar},${yTop} ${x + bar},${yTop + r} V${padT + plotH} Z`;
    const isActive = active?.i === i && active.series === series;
    return (
      <g key={series}>
        {d && <path d={d} fill={colour} opacity={active && !isActive ? 0.45 : 1} />}
        {/* Bigger invisible tap target */}
        <rect
          x={x - 3}
          y={padT}
          width={bar + 6}
          height={plotH}
          fill="transparent"
          className="cursor-pointer"
          onMouseEnter={() => setActive({ i, series })}
          onMouseLeave={() => setActive(null)}
          onClick={() => setActive(isActive ? null : { i, series })}
        >
          <title>
            {monthName(data[i].month)} {series === "sales" ? "sales" : "expenses"}: {formatNaira(value)}
          </title>
        </rect>
      </g>
    );
  }

  const tip = active
    ? {
        label: `${monthName(data[active.i].month)} · ${active.series === "sales" ? "Sales" : "Expenses"}`,
        value: formatNaira(active.series === "sales" ? data[active.i].salesKobo : data[active.i].expensesKobo),
      }
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-4" aria-label="Legend">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ backgroundColor: SALES }} /> Sales
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ backgroundColor: EXPENSES }} /> Expenses
          </span>
        </div>
        <button type="button" className="cursor-pointer text-primary" onClick={() => setAsTable(!asTable)}>
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Month</th>
              <th className="py-1.5 text-right font-medium">Sales</th>
              <th className="py-1.5 text-right font-medium">Expenses</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-b last:border-0">
                <td className="py-1.5">{monthName(d.month)}</td>
                <td className="py-1.5 text-right">{formatNaira(d.salesKobo)}</td>
                <td className="py-1.5 text-right">{formatNaira(d.expensesKobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <p className="h-5 text-sm" aria-live="polite">
            {tip ? (
              <>
                <span className="text-muted-foreground">{tip.label}: </span>
                <strong className="tabular-nums">{tip.value}</strong>
              </>
            ) : (
              <span className="text-muted-foreground">Tap a bar to see the amount</span>
            )}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sales and expenses by month">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#e4e5ec" strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#5f6278">
                  {shortNaira(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = padL + i * group + (group - (bar * 2 + 2)) / 2;
              return (
                <g key={d.month}>
                  {column(gx, d.salesKobo, SALES, i, "sales")}
                  {column(gx + bar + 2, d.expensesKobo, EXPENSES, i, "expenses")}
                  <text x={padL + i * group + group / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill="#5f6278">
                    {monthName(d.month)}
                  </text>
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}
