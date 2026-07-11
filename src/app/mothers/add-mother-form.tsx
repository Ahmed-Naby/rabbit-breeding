"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { TextField, SelectField, type Option } from "@/components/form-fields";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { createMother, type CreateMotherFormState } from "../rabbits/actions";

/**
 * Quick-add form for /mothers: creates a doe straight into the herd with its
 * tag assigned right away, instead of going through the /stock intake +
 * "إضافة إلى القطيع" promotion flow. Doesn't navigate away after saving so
 * several mothers can be entered back-to-back.
 */
export function AddMotherForm({ breedOptions }: { breedOptions: Option[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState<CreateMotherFormState, FormData>(
    createMother,
    EMPTY_FORM_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.rabbit) {
      toast.success(`تمت إضافة الأم رقم ${state.rabbit.tagId}`);
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const e = state.errors ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">إضافة أم</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {e._form ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {e._form}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              name="tagId"
              type="text"
              maxLength={10}
              label="رقم الأم"
              placeholder="مثال: 42 أو 5A"
              required
              error={e.tagId}
            />
            <SelectField
              name="breed"
              label="النوع"
              options={breedOptions}
              includeNone
              noneLabel="بلا"
              placeholder="اختر النوع…"
              error={e.breed}
            />
            <TextField
              name="weightKg"
              type="number"
              step="0.001"
              min={0}
              label="الوزن (كجم)"
              placeholder="اختياري"
              error={e.weightKg}
            />
          </div>
          <SubmitButton>إضافة الأم</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
