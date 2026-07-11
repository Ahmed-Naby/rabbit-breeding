import { z } from "zod";
import {
  SEXES,
  RABBIT_STATUSES,
  BREEDING_OUTCOMES,
  HEALTH_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_CATEGORIES,
  WEIGHT_UNITS,
} from "./enums";

// Shared coercers ----------------------------------------------------------

/** Trim a string; convert "" to undefined so optional fields stay clean. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Parse a date input string (yyyy-MM-dd) or ISO into a Date; "" -> undefined. */
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
    message: "تاريخ غير صالح",
  });

const requiredDate = z
  .string()
  .trim()
  .min(1, "مطلوب")
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "تاريخ غير صالح" });

/**
 * tagId is the rabbit/cage number — mostly digits, but a letter suffix is
 * allowed (e.g. "5A") since some cages are numbered that way, not just plain
 * integers.
 */
const TAG_ID_PATTERN = /^[A-Za-z0-9؀-ۿ]+$/;
function tagIdSchema(label: string) {
  return z
    .string({ message: `${label} مطلوب` })
    .trim()
    .min(1, `${label} مطلوب`)
    .max(10, `${label} طويل جدًا`)
    .regex(TAG_ID_PATTERN, `${label} يجب أن يحتوي على أرقام وحروف فقط`);
}

// Rabbit --------------------------------------------------------------------

export const rabbitSchema = z
  .object({
    tagId: tagIdSchema("رقم الأرنب"),
    breed: optionalText,
    color: optionalText,
    sex: z.enum(SEXES),
    dateOfBirth: optionalDate,
    status: z.enum(RABBIT_STATUSES),
    cage: optionalText,
    sireId: optionalText,
    damId: optionalText,
    acquiredDate: optionalDate,
    acquiredFrom: optionalText,
    notes: optionalText,
    photoUrl: optionalText,
    litterId: optionalText,
  })
  .refine((d) => d.sireId !== d.damId || !d.sireId, {
    message: "لا يمكن أن يكون الأب والأم نفس الأرنب",
    path: ["damId"],
  });

export type RabbitInput = z.infer<typeof rabbitSchema>;

/** "" / null / undefined -> undefined, so an empty optional tagId field doesn't fail validation. */
const optionalTagId = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  tagIdSchema("رقم الأرنب").optional()
);

const optionalWeightKg = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().positive("أدخل وزنًا أكبر من 0").optional()
);

/**
 * Fast intake (doe or buck): sex + date + breed always; tagId/weightKg
 * optional — left blank, the rabbit is registered as a "سلالة" (juvenile,
 * not yet promoted) with no tag and no weight record.
 */
export const quickRabbitSchema = z.object({
  sex: z.enum(["doe", "buck"], { message: "الجنس مطلوب" }),
  date: requiredDate,
  breed: optionalText,
  tagId: optionalTagId,
  weightKg: optionalWeightKg,
});

export type QuickRabbitInput = z.infer<typeof quickRabbitSchema>;

/**
 * Autosave, one field at a time, on /stock: a سلالة's رقم القفص and weight
 * each save independently as soon as they're entered (blurred), rather than
 * requiring both together behind a single submit click — losing an entered
 * value because the user navigated away before clicking a button was a real
 * complaint. Neither field moves the row off /stock by itself — only the
 * explicit "نقل إلى العنبر" button does (see promoteToHerdPen and the
 * `movedToHerdPen` filter on that page's query).
 */
export const saveQuickRabbitCageSchema = z.object({
  id: z.string().trim().min(1),
  cage: tagIdSchema("رقم القفص"),
});

export type SaveQuickRabbitCageInput = z.infer<typeof saveQuickRabbitCageSchema>;

export const saveQuickRabbitWeightSchema = z.object({
  id: z.string().trim().min(1),
  weightKg: z.coerce.number().positive("أدخل وزنًا أكبر من 0"),
});

export type SaveQuickRabbitWeightInput = z.infer<typeof saveQuickRabbitWeightSchema>;

/**
 * Second step of a doe's two-stage intake: she already has a cage number and
 * weight (assigned via finalizeQuickRabbit on /stock) — this assigns her
 * رقم الأم, the number that actually promotes her into the mothers herd, and
 * lets her weight be corrected/updated at the same time (editable, not just
 * a read-only carry-over from the /stock step).
 */
export const finalizeMotherSchema = z.object({
  id: z.string().trim().min(1),
  tagId: tagIdSchema("رقم الأم"),
  weightKg: z.coerce.number().positive("أدخل وزنًا أكبر من 0"),
});

export type FinalizeMotherInput = z.infer<typeof finalizeMotherSchema>;

/** Same idea as finalizeMotherSchema, mirrored for a buck's second intake stage on /bucks. */
export const finalizeBuckSchema = z.object({
  id: z.string().trim().min(1),
  tagId: tagIdSchema("رقم الذكر"),
  weightKg: z.coerce.number().positive("أدخل وزنًا أكبر من 0"),
});

export type FinalizeBuckInput = z.infer<typeof finalizeBuckSchema>;

/**
 * Adding a doe straight into the herd from /mothers — unlike quickRabbitSchema
 * (which registers a tagId-less "سلالة" for later promotion), the tag is
 * required up front since this row is meant to land directly on the mothers
 * table, not go through the /stock intake step first.
 */
export const createMotherSchema = z.object({
  tagId: tagIdSchema("رقم الأم"),
  breed: optionalText,
  weightKg: optionalWeightKg,
});

export type CreateMotherInput = z.infer<typeof createMotherSchema>;

/** Same idea as createMotherSchema, mirrored for adding a buck straight into the herd from /bucks. */
export const createBuckSchema = z.object({
  tagId: tagIdSchema("رقم الذكر"),
  breed: optionalText,
  weightKg: optionalWeightKg,
});

export type CreateBuckInput = z.infer<typeof createBuckSchema>;

// Breeding ------------------------------------------------------------------

export const breedingSchema = z
  .object({
    buckId: z.string().trim().min(1, "الذكر مطلوب"),
    doeId: z.string().trim().min(1, "الأنثى مطلوبة"),
    matingDate: requiredDate,
    actualKindlingDate: optionalDate,
    outcome: z.enum(BREEDING_OUTCOMES),
    notes: optionalText,
  })
  .refine((d) => d.buckId !== d.doeId, {
    message: "يجب أن يكون الذكر والأنثى أرنبين مختلفين",
    path: ["doeId"],
  });

export type BreedingInput = z.infer<typeof breedingSchema>;

// Litter --------------------------------------------------------------------

export const litterSchema = z
  .object({
    breedingId: z.string().trim().min(1),
    kindlingDate: requiredDate,
    bornAlive: z.coerce.number().int().min(0).default(0),
    bornDead: z.coerce.number().int().min(0).default(0),
    weaned: z.coerce.number().int().min(0).optional(),
    weaningDate: optionalDate,
    notes: optionalText,
  })
  .refine((d) => d.weaned === undefined || d.weaned <= d.bornAlive, {
    message: "لا يمكن أن يتجاوز المفطوم عدد المواليد الأحياء",
    path: ["weaned"],
  });

export type LitterInput = z.infer<typeof litterSchema>;

// Weight --------------------------------------------------------------------

export const weightSchema = z.object({
  rabbitId: z.string().trim().min(1),
  date: requiredDate,
  // Raw entry; the action converts to grams using the settings unit.
  unit: z.enum(WEIGHT_UNITS),
  kg: z.coerce.number().min(0).optional(),
  lb: z.coerce.number().min(0).optional(),
  oz: z.coerce.number().min(0).optional(),
  notes: optionalText,
});

export type WeightInput = z.infer<typeof weightSchema>;

// Health --------------------------------------------------------------------

export const healthSchema = z.object({
  rabbitId: z.string().trim().min(1),
  date: requiredDate,
  type: z.enum(HEALTH_TYPES),
  description: z.string().trim().min(1, "الوصف مطلوب"),
  nextDueDate: optionalDate,
});

export type HealthInput = z.infer<typeof healthSchema>;

// Transaction ---------------------------------------------------------------

export const transactionSchema = z.object({
  rabbitId: optionalText, // null/undefined = farm-wide
  date: requiredDate,
  type: z.enum(TRANSACTION_TYPES),
  category: z.enum(TRANSACTION_CATEGORIES),
  amount: z.coerce.number().positive("يجب أن يكون المبلغ أكبر من 0"),
  notes: optionalText,
});

export type TransactionInput = z.infer<typeof transactionSchema>;

// Settings ------------------------------------------------------------------

export const settingsSchema = z.object({
  weightUnit: z.enum(WEIGHT_UNITS),
  gestationDays: z.coerce.number().int().min(1).max(60),
  gestationWindowDays: z.coerce.number().int().min(0).max(14),
  pregnancyTestDays: z.coerce.number().int().min(1).max(30),
  weaningDays: z.coerce.number().int().min(0).max(90),
  nestBoxDays: z.coerce.number().int().min(1).max(30),
  matingWeightGrams: z.coerce.number().int().min(1),
  currency: z.string().trim().length(3).toUpperCase(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

// Breed ---------------------------------------------------------------------

export const breedSchema = z.object({
  name: z.string().trim().min(1, "اسم النوع مطلوب").max(50, "اسم النوع طويل جدًا"),
});

export type BreedInput = z.infer<typeof breedSchema>;
