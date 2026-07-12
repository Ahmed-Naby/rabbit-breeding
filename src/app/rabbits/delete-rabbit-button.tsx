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
      onClick={() =>
        start(async () => {
          const result = await deleteRabbit(id);
          if (result.ok) {
            toast.success(t.deletedToast);
            router.refresh();
          } else {
            toast.error(result.message ?? t.deleteFailedFallback);
          }
        })
      }
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
