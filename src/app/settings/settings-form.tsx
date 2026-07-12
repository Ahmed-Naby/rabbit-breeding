"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { TextField, SelectField, type Option } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { WEIGHT_UNITS, label } from "@/lib/enums";
import type { AppSettings } from "@/lib/settings";
import { updateSettings } from "./actions";

const unitOptions: Option[] = WEIGHT_UNITS.map((u) => ({
  value: u,
  label: label(u),
}));

const rebreedOptions: Option[] = [
  { value: "0", label: "مكثف — تلقيح يوم الولادة" },
  { value: "15", label: "نصف مكثف — 15 يومًا بعد الولادة" },
  { value: "30", label: "طبيعي — 30 يومًا بعد الولادة" },
];

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction] = useActionState(updateSettings, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "تم الحفظ");
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="weightUnit"
            label="وحدة الوزن"
            options={unitOptions}
            defaultValue={settings.weightUnit}
            hint="كيف تُدخل الأوزان وتُعرض."
            error={e.weightUnit}
          />
          <TextField
            name="currency"
            label="رمز العملة"
            defaultValue={settings.currency}
            maxLength={3}
            hint="رمز ISO من 3 أحرف، مثل EGP أو USD أو EUR."
            error={e.currency}
          />
          <TextField
            name="gestationDays"
            type="number"
            min={1}
            max={60}
            label="مدة الحمل (أيام)"
            defaultValue={settings.gestationDays.toString()}
            hint="تُستخدم لحساب مواعيد الولادة المتوقعة (الافتراضي 31)."
            error={e.gestationDays}
          />
          <TextField
            name="gestationWindowDays"
            type="number"
            min={0}
            max={14}
            label="نافذة الولادة (± أيام)"
            defaultValue={settings.gestationWindowDays.toString()}
            hint="عدد الأيام المبكرة/المتأخرة التي لا تزال تُحتسب كـ 'مستحقة' وليست 'متأخرة'."
            error={e.gestationWindowDays}
          />
          <TextField
            name="pregnancyTestDays"
            type="number"
            min={1}
            max={30}
            label="مدة انتظار الجس (أيام)"
            defaultValue={settings.pregnancyTestDays.toString()}
            hint="عدد الأيام بعد التلقيح قبل ما تظهر الأم في صفحة 'عمليات الجس' (الافتراضي 10)."
            error={e.pregnancyTestDays}
          />
          <TextField
            name="weaningDays"
            type="number"
            min={0}
            max={90}
            label="مدة انتظار الفطام (أيام)"
            defaultValue={settings.weaningDays.toString()}
            hint="عدد الأيام بعد الولادة قبل ما تظهر الأم في صفحة 'عمليات الفطام' (الافتراضي 28)."
            error={e.weaningDays}
          />
          <TextField
            name="nestBoxDays"
            type="number"
            min={1}
            max={30}
            label="مدة تركيب بيت الولادة (أيام)"
            defaultValue={settings.nestBoxDays.toString()}
            hint="عدد الأيام بعد التلقيح قبل ما تظهر الأم في صفحة 'تركيب بيوت الولادة' (الافتراضي 27)."
            error={e.nestBoxDays}
          />
          <TextField
            name="matingWeightGrams"
            type="number"
            min={1}
            label="وزن التلقيح (جرام)"
            defaultValue={settings.matingWeightGrams.toString()}
            hint="مرجعي فقط حاليًا — الإضافة لجدول الأمهات/الذكور تتم يدويًا من صفحة إضافة أرنب."
            error={e.matingWeightGrams}
          />
          <SelectField
            name="rebreedAfterKindlingDays"
            label="نظام إعادة التلقيح بعد الولادة"
            options={rebreedOptions}
            defaultValue={settings.rebreedAfterKindlingDays.toString()}
            hint="المدة قبل ما تصبح الأم المرضعة جاهزة للتلقيح مرة أخرى."
            error={e.rebreedAfterKindlingDays}
          />
        </CardContent>
      </Card>
      <SubmitButton>حفظ الإعدادات</SubmitButton>
    </form>
  );
}
