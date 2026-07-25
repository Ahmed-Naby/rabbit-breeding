"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteRabbit } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export function DeleteRabbitButton({ id, t }: { id: string; t: Dictionary["stock"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      onClick={() => {
        // Not a plain "are you sure": the delete puts the animal back into
        // رصيد الفطام, so the farmer has to physically move it to the weaning
        // cages or the balance and the pens stop matching.
        if (!window.confirm(t.deleteConfirm)) return;
        start(async () => {
          const result = await deleteRabbit(id);
          if (result.ok) {
            toast.success(t.deletedToast);
            router.refresh();
          } else {
            toast.error(result.message ?? t.deleteFailedFallback);
          }
        });
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
