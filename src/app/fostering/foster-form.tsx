"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { transferKits } from "../breedings/actions";

export function FosterForm() {
  const [state, formAction] = useActionState(transferKits, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "تم تسجيل نقل الرضاعة");
      formRef.current?.reset();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              name="fromTagId"
              label="من (رقم الأم المنقول منها)"
              required
              error={e.fromTagId}
            />
            <TextField
              name="toTagId"
              label="إلى (رقم الأم المنقول إليها)"
              required
              error={e.toTagId}
            />
            <TextField
              name="count"
              type="number"
              min={1}
              step={1}
              label="العدد"
              required
              error={e.count}
            />
          </div>
          <SubmitButton>حفظ</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
