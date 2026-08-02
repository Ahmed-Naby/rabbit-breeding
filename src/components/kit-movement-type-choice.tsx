"use client";

import { Layers, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/locales";

export type KitMovementChoice = "sale" | "adjustment";

/**
 * The نوع الحركة picker on الفطام والبيع, shared by the web form and the mobile
 * one so the two stay the same shape.
 *
 * Two side-by-side buttons rather than a dropdown: there are only two choices,
 * and the choice decides whether the form asks for a وزن and a سعر كيلو at all.
 * A closed <select> showed one of them and hid the other, so the farmer had to
 * open it to see what he was about to record.
 *
 * «نافق فطام» is not offered here. Deaths belong on حصر النافق, which checks the
 * count against the doe it came from; this form never did. The movement type
 * still exists in the data — old rows render in the ledger, and the mortality
 * page writes new ones.
 */
export function KitMovementTypeChoice({
  value,
  onChange,
  disabled,
  locale,
  /** When set, a hidden input carries the choice into a server action. */
  name,
}: {
  value: KitMovementChoice;
  onChange: (value: KitMovementChoice) => void;
  disabled?: boolean;
  locale: Locale;
  name?: string;
}) {
  const options = [
    {
      value: "sale" as const,
      label: locale === "ar" ? "بيع خلفات" : "Kit Sale",
      icon: ShoppingCart,
      // The same sky/amber pair the ledger rows below already use for these two
      // kinds, so the button and the row it produces read as one thing.
      active: "border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      icon_active: "text-sky-600 dark:text-sky-400",
    },
    {
      value: "adjustment" as const,
      label: locale === "ar" ? "تسوية المخزون" : "Stock Adjustment",
      icon: Layers,
      active: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      icon_active: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <div role="radiogroup" className="flex gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all cursor-pointer",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? cn(option.active, "shadow-xs")
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {/* The radio dot as well as the tint: colour alone says "this one
                  is different", the dot says "this one is chosen, and the other
                  is still there to choose". It takes the button's own text
                  colour through currentColor, so it tints with it. */}
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  selected ? "border-current" : "border-muted-foreground/50"
                )}
              >
                {selected && <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <Icon className={cn("size-4", selected ? option.icon_active : "text-muted-foreground")} />
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
