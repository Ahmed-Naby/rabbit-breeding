"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { TextField, SelectField, type Option } from "@/components/form-fields";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { createMother, type CreateMotherFormState } from "../rabbits/actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Quick-add form for /mothers: creates a doe straight into the herd with its
 * tag assigned right away, instead of going through the /stock intake +
 * "إضافة إلى القطيع" promotion flow. Doesn't navigate away after saving so
 * several mothers can be entered back-to-back.
 */
export function AddMotherForm({
  breedOptions,
  tCommon,
  locale = "ar",
}: {
  breedOptions: Option[];
  tCommon: Dictionary["common"];
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).mothers;
  const router = useRouter();
  const [state, formAction] = useActionState<CreateMotherFormState, FormData>(
    createMother,
    EMPTY_FORM_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.rabbit) {
      toast.success(t.addedToast(state.rabbit.tagId ?? ""));
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const e = state.errors ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.addFormTitle}</CardTitle>
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
              label={t.tagLabel}
              placeholder={t.tagPlaceholder}
              required
              error={e.tagId}
            />
            <SelectField
              name="breed"
              label={t.breedLabel}
              options={breedOptions}
              includeNone
              noneLabel={tCommon.none}
              placeholder={tCommon.selectPlaceholder}
              error={e.breed}
            />
            <TextField
              name="weightKg"
              type="number"
              step="0.25"
              min={0}
              label={t.weightLabel}
              placeholder={t.weightPlaceholder}
              error={e.weightKg}
            />
          </div>
          <SubmitButton pendingText={tCommon.saving}>{t.submitButton}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
