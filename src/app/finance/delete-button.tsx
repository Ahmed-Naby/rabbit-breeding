"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTransaction } from "./actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function DeleteTransactionButton({
  id,
  locale,
}: {
  id: string;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).finance;
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteTransaction(id);
          toast.success(t.deletedToast);
        })
      }
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
