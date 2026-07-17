// Central definition of the "enum-like" String fields. SQLite can't store native
// enums, so these arrays are the single source of truth used by Zod validation,
// select dropdowns, and display labels. On a Postgres swap these map 1:1 to enums.

export const SEXES = ["buck", "doe", "unknown"] as const;
export type Sex = (typeof SEXES)[number];

export const RABBIT_STATUSES = [
  "active",
  "sold",
  "culled",
  "deceased",
  "reference",
  "resting",
] as const;
export type RabbitStatus = (typeof RABBIT_STATUSES)[number];

export const BREEDING_OUTCOMES = [
  "pending",
  "successful",
  "failed",
  "not_pregnant",
] as const;
export type BreedingOutcome = (typeof BREEDING_OUTCOMES)[number];

/** Early pregnancy check result, done ~10 days after mating. */
export const PREGNANCY_TEST_RESULTS = ["pending", "positive", "negative"] as const;
export type PregnancyTestResult = (typeof PREGNANCY_TEST_RESULTS)[number];

/** Days after mating when the pregnancy test (palpation) should be done. */
export const PREGNANCY_TEST_OFFSET_DAYS = 10;

export const HEALTH_TYPES = [
  "vaccination",
  "treatment",
  "illness",
  "deworming",
  "checkup",
] as const;
export type HealthType = (typeof HEALTH_TYPES)[number];

export const TRANSACTION_TYPES = ["income", "expense"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_CATEGORIES = [
  "sale",
  "purchase",
  "feed",
  "vet",
  "equipment",
  "other",
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export const WEIGHT_UNITS = ["kg", "lb_oz"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** How a rabbit entered the herd — set automatically, never user-picked from a dropdown. */
export const RABBIT_ORIGINS = ["external", "farm"] as const;
export type RabbitOrigin = (typeof RABBIT_ORIGINS)[number];

/**
 * Manual reproductive state for does. Set exclusively via explicit action
 * buttons (mate/pregnant/negative/kindle/wean/exclude) — never auto-derived.
 */
export const DOE_STATES = [
  "empty",
  "bred",
  "pregnant",
  "nursing",
  "nursing_bred",
  "nursing_pregnant",
  "excluded",
] as const;
export type DoeState = (typeof DOE_STATES)[number];

import type { Locale } from "./i18n/locales";

// Human-friendly labels per locale. Fallback covers anything not listed.
// Note: "pending" is intentionally reused by both BREEDING_OUTCOMES and
// PREGNANCY_TEST_RESULTS — a single translation reads fine for both, so this
// is left as one flat keyspace rather than namespaced per category.
export const LABELS: Record<Locale, Record<string, string>> = {
  ar: {
    buck: "ذكر",
    doe: "أنثى",
    unknown: "غير معروف",
    active: "نشط",
    sold: "مباع",
    culled: "مستبعد",
    deceased: "نافق",
    reference: "مرجع",
    pending: "قيد الانتظار",
    successful: "ناجح",
    failed: "فاشل / امتصاص",
    not_pregnant: "غير حامل",
    positive: "موجب",
    negative: "سالب",
    vaccination: "تطعيم",
    treatment: "علاج",
    illness: "مرض",
    deworming: "تخليص من الديدان",
    checkup: "فحص دوري",
    income: "إيراد",
    expense: "مصروف",
    sale: "بيع",
    purchase: "شراء",
    feed: "علف",
    vet: "بيطري",
    equipment: "معدات",
    other: "أخرى",
    kg: "كيلوجرام",
    lb_oz: "رطل / أونصة",
    empty: "فاضية",
    bred: "ملقحة",
    pregnant: "عشار",
    nursing: "مرضعة",
    nursing_bred: "مرضعة و ملقحة",
    nursing_pregnant: "مرضعة و عشار",
    excluded: "مستبعدة",
    resting: "راحة",
    external: "من خارج المزرعة",
    farm: "من سلالات المزرعة",
  },
  en: {
    buck: "Buck",
    doe: "Doe",
    unknown: "Unknown",
    active: "Active",
    sold: "Sold",
    culled: "Culled",
    deceased: "Deceased",
    reference: "Reference",
    pending: "Pending",
    successful: "Successful",
    failed: "Failed / resorbed",
    not_pregnant: "Not pregnant",
    positive: "Positive",
    negative: "Negative",
    vaccination: "Vaccination",
    treatment: "Treatment",
    illness: "Illness",
    deworming: "Deworming",
    checkup: "Checkup",
    income: "Income",
    expense: "Expense",
    sale: "Sale",
    purchase: "Purchase",
    feed: "Feed",
    vet: "Vet",
    equipment: "Equipment",
    other: "Other",
    kg: "Kilograms",
    lb_oz: "Pounds / ounces",
    empty: "Empty",
    bred: "Bred",
    pregnant: "Pregnant",
    nursing: "Nursing",
    nursing_bred: "Nursing & bred",
    nursing_pregnant: "Nursing & pregnant",
    excluded: "Excluded",
    resting: "Resting",
    external: "From outside the farm",
    farm: "Farm-bred",
  },
};

export function label(value: string | null | undefined, locale: Locale = "ar"): string {
  if (!value) return "—";
  return (
    LABELS[locale][value] ??
    value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
