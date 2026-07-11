"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { addBreed, deleteBreed } from "./actions";

function BreedChip({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pe-1 ps-3 text-sm">
      {name}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        className="size-5 rounded-full"
        onClick={() =>
          start(async () => {
            await deleteBreed(id);
            toast.success("تم حذف النوع");
          })
        }
      >
        <X className="size-3.5 text-muted-foreground" />
      </Button>
    </span>
  );
}

export function BreedsManager({
  breeds,
}: {
  breeds: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(addBreed, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "تم الإضافة");
  }, [state]);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">أنواع الأرانب</h2>
          <p className="text-sm text-muted-foreground">
            الأنواع المسجلة هنا تظهر كقائمة اختيار عند إضافة أو تعديل أرنب.
          </p>
        </div>

        {breeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أنواع مسجلة بعد.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {breeds.map((b) => (
              <BreedChip key={b.id} id={b.id} name={b.name} />
            ))}
          </div>
        )}

        <form action={formAction} className="flex items-end gap-3">
          <TextField
            name="name"
            label="نوع جديد"
            placeholder="مثال: نيوزيلندي أبيض"
            error={e.name}
            className="flex-1"
          />
          <SubmitButton>إضافة</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
