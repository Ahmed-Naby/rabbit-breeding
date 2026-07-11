"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordNursingKitDeath } from "../breedings/actions";
import { setRabbitStatus } from "../rabbits/actions";

/** "+1 نافق" on a nursing doe's current litter — moves one kit from "حي" to "نافق". */
export function NursingKitDeathButton({ breedingId }: { breedingId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-7 px-2 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
      onClick={() => {
        const confirmed = window.confirm("هل تريد تسجيل وفاة رضيع عند هذه الأم؟");
        if (!confirmed) return;
        startTransition(async () => {
          const result = await recordNursingKitDeath(breedingId);
          if (!result.ok) {
            toast.error(result.message ?? "تعذر تسجيل الوفاة");
            return;
          }
          toast.success("تم تسجيل وفاة الرضيع");
        });
      }}
    >
      +1 نافق
    </Button>
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
}: {
  id: string;
  confirmText: string;
}) {
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
          toast.success("تم تسجيل النافق");
        });
      }}
    >
      تسجيل نافق
    </Button>
  );
}
