import type { Locale } from "@/lib/i18n/locales";

export const DISEASE_TYPES = [
  "mange",
  "soreHocks",
  "uterineInfection",
  "mastitis",
  "worms",
  "eyeDischarge",
  "cold",
  "diarrhea",
  "wasting",
  "other",
] as const;

export type DiseaseType = (typeof DISEASE_TYPES)[number];

const DISEASE_LABELS: Record<DiseaseType, { ar: string; en: string }> = {
  mange: { ar: "جرب", en: "Mange" },
  soreHocks: { ar: "عرقوب", en: "Sore hocks" },
  uterineInfection: { ar: "التهاب رحم", en: "Uterine infection" },
  mastitis: { ar: "التهاب ضرع", en: "Mastitis" },
  worms: { ar: "ديدان", en: "Worms" },
  eyeDischarge: { ar: "تصمغ", en: "Eye discharge" },
  cold: { ar: "برد", en: "Cold" },
  diarrhea: { ar: "اسهال", en: "Diarrhea" },
  wasting: { ar: "هزال", en: "Wasting" },
  other: { ar: "أخرى", en: "Other" },
};

export function diseaseTypeLabel(key: DiseaseType, locale: Locale): string {
  return DISEASE_LABELS[key][locale];
}
