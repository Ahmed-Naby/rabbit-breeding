"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { transferKits } from "../breedings/actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function FosterForm({ locale = "ar" }: { locale?: Locale }) {
  const t = getClientDictionary(locale).fostering;
  const [state, formAction] = useActionState(transferKits, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? t.successToast);
      formRef.current?.reset();
    } else if (state.message) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              name="fromTagId"
              label={t.fromLabel}
              required
              error={e.fromTagId}
            />
            <TextField
              name="toTagId"
              label={t.toLabel}
              required
              error={e.toTagId}
            />
            <TextField
              name="count"
              type="number"
              min={1}
              step={1}
              label={t.countLabel}
              required
              error={e.count}
            />
          </div>
          <SubmitButton>{t.submitButton}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
