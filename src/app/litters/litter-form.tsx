"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { TextField, TextareaField } from "@/components/form-fields";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";

export type LitterValues = {
  id: string;
  kindlingDate: string | Date;
  bornAlive: number;
  bornDead: number;
  weaned: number | null;
  weaningDate: string | Date | null;
  notes: string | null;
};

export function LitterForm({
  action,
  litter,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  litter: LitterValues;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            name="kindlingDate"
            type="date"
            label="تاريخ الولادة"
            required
            defaultValue={toDateInputValue(new Date(litter.kindlingDate))}
            error={e.kindlingDate}
          />
          <div />
          <TextField
            name="bornAlive"
            type="number"
            min={0}
            label="مواليد أحياء"
            defaultValue={litter.bornAlive.toString()}
            error={e.bornAlive}
          />
          <TextField
            name="bornDead"
            type="number"
            min={0}
            label="مواليد أموات"
            defaultValue={litter.bornDead.toString()}
            error={e.bornDead}
          />
          <TextField
            name="weaned"
            type="number"
            min={0}
            label="مفطوم"
            defaultValue={litter.weaned?.toString() ?? ""}
            error={e.weaned}
          />
          <TextField
            name="weaningDate"
            type="date"
            label="تاريخ الفطام"
            defaultValue={toDateInputValue(
              litter.weaningDate ? new Date(litter.weaningDate) : null
            )}
            error={e.weaningDate}
          />
          <TextareaField
            name="notes"
            label="ملاحظات"
            rows={3}
            defaultValue={litter.notes ?? ""}
            error={e.notes}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <SubmitButton>حفظ التغييرات</SubmitButton>
        <Button variant="ghost" type="button" asChild>
          <Link href={`/litters/${litter.id}`}>إلغاء</Link>
        </Button>
      </div>
    </form>
  );
}
