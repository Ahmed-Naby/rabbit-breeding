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

export function StatusMenu({
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
            تغيير الحالة
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
                toast.success(`تم ضبط الحالة: ${label(s)}`);
              })
            }
          >
            {label(s)}
            {s === current ? " (الحالية)" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
