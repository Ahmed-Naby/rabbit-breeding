"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteRabbit } from "./actions";

export function DeleteRabbitButton({ id }: { id: string }) {
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
            toast.success("تم حذف السلالة");
            router.refresh();
          } else {
            toast.error(result.message ?? "تعذر حذف السلالة");
          }
        })
      }
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
