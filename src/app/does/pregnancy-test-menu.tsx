"use client";

import { useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PREGNANCY_TEST_RESULTS, type PregnancyTestResult } from "@/lib/enums";
import { setPregnancyTestResult } from "../breedings/actions";

const AR_LABEL: Record<PregnancyTestResult, string> = {
  pending: "قيد الانتظار",
  positive: "موجب",
  negative: "سالب",
};

export function PregnancyTestMenu({
  id,
  current,
}: {
  id: string;
  current: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            تسجيل النتيجة
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {PREGNANCY_TEST_RESULTS.map((r) => (
          <DropdownMenuItem
            key={r}
            disabled={r === current}
            onClick={() =>
              startTransition(async () => {
                await setPregnancyTestResult(id, r);
                toast.success(`تم ضبط نتيجة الفحص: ${AR_LABEL[r]}`);
              })
            }
          >
            {AR_LABEL[r]}
            {r === current ? " (الحالية)" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
