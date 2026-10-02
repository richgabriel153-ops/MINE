"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

import { MoneyInput } from "@/components/form/money-input";
import { QuantityInput } from "@/components/form/quantity-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newItem, type FormErrors, type FormItem } from "@/lib/document-form";
import { formatNaira } from "@/lib/money";
import { lineTotalKobo } from "@/lib/totals";

export function LineItemsEditor({
  items,
  onChange,
  errors,
}: {
  items: FormItem[];
  onChange: (items: FormItem[]) => void;
  errors?: FormErrors["itemErrors"];
}) {
  const focusId = useRef<string | null>(null);

  useEffect(() => {
    if (focusId.current) {
      document.getElementById(`item-${focusId.current}-desc`)?.focus();
      focusId.current = null;
    }
  }, [items.length]);

  function update(id: string, patch: Partial<FormItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function remove(id: string) {
    const rest = items.filter((i) => i.id !== id);
    onChange(rest.length ? rest : [newItem()]);
  }

  function add() {
    const item = newItem();
    focusId.current = item.id;
    onChange([...items, item]);
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => {
          const e = errors?.[item.id];
          const lineTotal =
            item.unitPriceKobo !== null && item.quantity !== null
              ? lineTotalKobo({ quantity: item.quantity, unitPriceKobo: item.unitPriceKobo })
              : null;
          return (
            <li key={item.id} className="rounded-xl border bg-card p-3 shadow-xs">
              <div className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`item-${item.id}-desc`} className="sr-only">
                    Item {index + 1} description
                  </Label>
                  <Input
                    id={`item-${item.id}-desc`}
                    value={item.description}
                    onChange={(ev) => update(item.id, { description: ev.target.value })}
                    placeholder={index === 0 ? "Item or service, e.g. Ankara gown" : "Item or service"}
                    aria-invalid={!!e?.description || undefined}
                    maxLength={120}
                    enterKeyHint="next"
                  />
                  {e?.description && <p className="text-sm text-destructive">{e.description}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-[5rem_1fr] gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`item-${item.id}-qty`} className="text-xs text-muted-foreground">
                    Qty
                  </Label>
                  <QuantityInput
                    id={`item-${item.id}-qty`}
                    value={item.quantity}
                    onChange={(quantity) => update(item.id, { quantity })}
                    invalid={!!e?.quantity}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`item-${item.id}-price`} className="text-xs text-muted-foreground">
                    Price for one
                  </Label>
                  <MoneyInput
                    id={`item-${item.id}-price`}
                    value={item.unitPriceKobo}
                    onChange={(unitPriceKobo) => update(item.id, { unitPriceKobo })}
                    invalid={!!e?.price}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-destructive">{e?.quantity ?? e?.price ?? ""}</span>
                <span className="text-muted-foreground tabular-nums">
                  {lineTotal !== null && item.quantity !== 1 ? `= ${formatNaira(lineTotal)}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" className="border-dashed" onClick={add}>
        <Plus /> Add another item
      </Button>
    </div>
  );
}
