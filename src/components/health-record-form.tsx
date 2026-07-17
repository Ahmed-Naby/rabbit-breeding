"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createHealthRecord } from "@/app/health/actions";
import { diseaseTypeLabel, type DiseaseType } from "@/lib/health-conditions";
import type { Locale } from "@/lib/i18n/locales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const HEALTH_TYPE_KEYS = ["illness", "treatment", "vaccination", "deworming", "checkup"] as const;

type HealthRoundsText = {
  healthAddButton: string;
  healthCancelButton: string;
  healthSaveButton: string;
  healthSavedToast: string;
  healthDescriptionPlaceholder: string;
  healthDescriptionRequired: string;
};

/**
 * Inline "log an illness/treatment" widget used on the rounds pages — a
 * toggle button that expands into a type/disease select + description input,
 * writing through the same createHealthRecord action the /health page would
 * use if it had one, since it doesn't have any write path of its own yet.
 */
export function HealthRecordButton({
  rabbitId,
  locale,
  diseaseTypes,
  defaultDisease,
  t,
}: {
  rabbitId: string;
  locale: Locale;
  diseaseTypes: readonly DiseaseType[];
  defaultDisease: DiseaseType;
  t: HealthRoundsText;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<string>("illness");
  const [disease, setDisease] = useState<DiseaseType>(defaultDisease);
  const [description, setDescription] = useState("");

  const typeLabels: Record<string, string> = {
    illness: locale === "ar" ? "مرض" : "Illness",
    treatment: locale === "ar" ? "علاج" : "Treatment",
    vaccination: locale === "ar" ? "تحصين" : "Vaccination",
    deworming: locale === "ar" ? "مضاد طفيليات" : "Deworming",
    checkup: locale === "ar" ? "فحص دوري" : "Checkup",
  };

  const reset = () => {
    setType("illness");
    setDisease(defaultDisease);
    setDescription("");
  };

  const handleSave = async () => {
    if (!description.trim()) {
      toast.error(t.healthDescriptionRequired);
      return;
    }
    setPending(true);
    await createHealthRecord({
      rabbitId,
      date: new Date(),
      type,
      description: description.trim(),
      nextDueDate: null,
    });
    setPending(false);
    toast.success(t.healthSavedToast);
    setOpen(false);
    reset();
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2.5 text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        {t.healthAddButton}
      </Button>
      {open ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              items={HEALTH_TYPE_KEYS.map((value) => ({ value, label: typeLabels[value] }))}
              value={type}
              onValueChange={(v) => setType(v ?? "illness")}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEALTH_TYPE_KEYS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {typeLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {type === "illness" ? (
              <Select
                items={diseaseTypes.map((value) => ({ value, label: diseaseTypeLabel(value, locale) }))}
                value={disease}
                onValueChange={(v) => {
                  const next = (v ?? defaultDisease) as DiseaseType;
                  setDisease(next);
                  setDescription(next === "other" ? "" : diseaseTypeLabel(next, locale));
                }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {diseaseTypes.map((value) => (
                    <SelectItem key={value} value={value}>
                      {diseaseTypeLabel(value, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.healthDescriptionPlaceholder}
              className="h-8 min-w-40 flex-1 text-xs"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              {t.healthCancelButton}
            </Button>
            <Button size="sm" className="h-8 px-2.5 text-xs" disabled={pending} onClick={handleSave}>
              {t.healthSaveButton}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
