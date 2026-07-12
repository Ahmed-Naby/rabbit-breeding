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
import { BREEDING_OUTCOMES, label } from "@/lib/enums";
import { setBreedingOutcome } from "../actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function OutcomeMenu({
  id,
  current,
  locale,
}: {
  id: string;
  current: string;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).breedings;
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
            {t.changeOutcomeButton}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {BREEDING_OUTCOMES.map((o) => (
          <DropdownMenuItem
            key={o}
            disabled={o === current}
            onClick={() =>
              startTransition(async () => {
                await setBreedingOutcome(id, o);
                toast.success(t.outcomeSetToast(label(o, locale)));
              })
            }
          >
            {label(o, locale)}
            {o === current ? t.currentSuffix : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
