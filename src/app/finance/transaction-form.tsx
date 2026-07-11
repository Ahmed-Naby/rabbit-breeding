"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { TextField, TextareaField, SelectField, type Option } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import {
  TRANSACTION_TYPES,
  TRANSACTION_CATEGORIES,
  label,
} from "@/lib/enums";
import { createTransaction } from "./actions";

const typeOptions: Option[] = TRANSACTION_TYPES.map((t) => ({
  value: t,
  label: label(t),
}));
const categoryOptions: Option[] = TRANSACTION_CATEGORIES.map((c) => ({
  value: c,
  label: label(c),
}));

export function TransactionForm({
  rabbitOptions,
  currency,
}: {
  rabbitOptions: Option[];
  currency: string;
}) {
  const [state, formAction] = useActionState(
    createTransaction,
    EMPTY_FORM_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success("تمت إضافة المعاملة");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              name="date"
              type="date"
              label="التاريخ"
              required
              defaultValue={toDateInputValue(new Date())}
              error={e.date}
            />
            <SelectField
              name="type"
              label="النوع"
              options={typeOptions}
              defaultValue="expense"
              error={e.type}
            />
            <SelectField
              name="category"
              label="الفئة"
              options={categoryOptions}
              defaultValue="feed"
              error={e.category}
            />
            <TextField
              name="amount"
              type="number"
              step="0.01"
              min={0}
              label={`المبلغ (${currency})`}
              required
              error={e.amount}
            />
            <SelectField
              name="rabbitId"
              label="الأرنب (اختياري)"
              options={rabbitOptions}
              includeNone
              noneLabel="على مستوى المزرعة"
              placeholder="على مستوى المزرعة"
              error={e.rabbitId}
            />
            <TextField name="notes" label="ملاحظات" error={e.notes} />
          </div>
          <SubmitButton>إضافة معاملة</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
