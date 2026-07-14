"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordNursingKitDeath } from "../breedings/actions";
import { recordWeanedKitDeath } from "../weaning-sales/actions";
import { setRabbitStatus } from "../rabbits/actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

/** "تسجيل نافق" on a nursing doe's current litter — moves N kits from "حي" to "نافق". */
export function NursingKitDeathButton({
  breedingId,
  bornAlive,
  locale,
}: {
  breedingId: string;
  bornAlive: number;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).mortality;
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(1);
  const disabled = bornAlive <= 0;
  return (
    <div className="flex items-center justify-center gap-2">
      <Input
        type="number"
        min={1}
        max={Math.max(bornAlive, 1)}
        value={count}
        disabled={pending || disabled}
        aria-label={t.nursingKitCountInputLabel}
        className="h-7 w-16 px-2 text-xs"
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isNaN(next)) return;
          setCount(next);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending || disabled || count < 1 || count > bornAlive}
        className="h-7 px-2 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        onClick={() => {
          const confirmed = window.confirm(t.nursingKitDeathConfirm(count));
          if (!confirmed) return;
          startTransition(async () => {
            const result = await recordNursingKitDeath(breedingId, count);
            if (!result.ok) {
              toast.error(result.message ?? t.recordDeathFailedFallback);
              return;
            }
            toast.success(t.kitDeathToast(count));
            setCount(1);
          });
        }}
      >
        {t.recordNursingDeathButton}
      </Button>
    </div>
  );
}

/** Records N deaths at once from the weaned (post-weaning, not-yet-sold) kit stock shown on /mortality. */
export function WeaningStockDeathButton({
  locale,
  availableStock,
}: {
  locale: Locale;
  availableStock: number;
}) {
  const t = getClientDictionary(locale).mortality;
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(1);
  const disabled = availableStock <= 0;
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        max={Math.max(availableStock, 1)}
        value={count}
        disabled={pending || disabled}
        aria-label={t.weaningStockCountInputLabel}
        className="h-7 w-16 px-2 text-xs"
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isNaN(next)) return;
          setCount(next);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending || disabled || count < 1 || count > availableStock}
        className="h-7 px-2 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        onClick={() => {
          const confirmed = window.confirm(t.weaningStockDeathConfirm(count));
          if (!confirmed) return;
          startTransition(async () => {
            const result = await recordWeanedKitDeath(count);
            if (!result.ok) {
              toast.error(result.message ?? t.recordDeathFailedFallback);
              return;
            }
            toast.success(t.weaningStockDeathToast(count));
            setCount(1);
          });
        }}
      >
        {t.recordWeaningDeathButton}
      </Button>
    </div>
  );
}

/**
 * "تسجيل نافق" for an individual rabbit (أم / ذكر / سلالة): flips status to
 * "deceased" via the same setRabbitStatus used by the rabbit detail page's
 * status menu — this is what removes her/him from every active table/board
 * and surfaces her/him on the deceased history table below instead.
 */
export function MarkDeceasedButton({
  id,
  confirmText,
  locale,
}: {
  id: string;
  confirmText: string;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).mortality;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-7 px-2 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
      onClick={() => {
        const confirmed = window.confirm(confirmText);
        if (!confirmed) return;
        startTransition(async () => {
          await setRabbitStatus(id, "deceased");
          toast.success(t.deceasedToast);
        });
      }}
    >
      {t.recordDeceasedButton}
    </Button>
  );
}
