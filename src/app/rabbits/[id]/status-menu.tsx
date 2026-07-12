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
import { RABBIT_STATUSES, label } from "@/lib/enums";
import { setRabbitStatus } from "../actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function StatusMenu({
  id,
  current,
  locale,
}: {
  id: string;
  current: string;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).rabbits;
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
            {t.changeStatusButton}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {RABBIT_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === current}
            onClick={() =>
              startTransition(async () => {
                await setRabbitStatus(id, s);
                toast.success(t.statusSetToast(label(s, locale)));
              })
            }
          >
            {label(s, locale)}
            {s === current ? t.currentSuffix : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
