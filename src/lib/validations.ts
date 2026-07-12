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
import type { Dictionary } from "./i18n/dictionaries/ar";

// Shared coercers ----------------------------------------------------------

/** Trim a string; convert "" to undefined so optional fields stay clean. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Parse a date input string (yyyy-MM-dd) or ISO into a Date; "" -> undefined. */
function optionalDate(t: Dictionary["validation"]) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
      message: t.invalidDate,
    });
}

function requiredDate(t: Dictionary["validation"]) {
  return z
    .string()
    .trim()
    .min(1, t.required)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: t.invalidDate });
}

/**
 * tagId is the rabbit/cage number — mostly digits, but a letter suffix is
 * allowed (e.g. "5A") since some cages are numbered that way, not just plain
 * integers.
 */
const TAG_ID_PATTERN = /^[A-Za-z0-9؀-ۿ]+$/;
function tagIdSchema(label: string, t: Dictionary["validation"]) {
  return z
    .string({ message: t.tagRequired(label) })
    .trim()
    .min(1, t.tagRequired(label))
    .max(10, t.tagTooLong(label))
    .regex(TAG_ID_PATTERN, t.tagInvalidChars(label));
}

// Rabbit --------------------------------------------------------------------

export function rabbitSchema(t: Dictionary["validation"]) {
  return z
    .object({
      tagId: tagIdSchema(t.rabbitTagLabel, t),
      breed: optionalText,
      color: optionalText,
      sex: z.enum(SEXES),
      dateOfBirth: optionalDate(t),
      status: z.enum(RABBIT_STATUSES),
      cage: optionalText,
      sireId: optionalText,
      damId: optionalText,
      acquiredDate: optionalDate(t),
      acquiredFrom: optionalText,
      notes: optionalText,
      photoUrl: optionalText,
      litterId: optionalText,
    })
    .refine((d) => d.sireId !== d.damId || !d.sireId, {
      message: t.parentsSame,
      path: ["damId"],
    });
}

export type RabbitInput = z.infer<ReturnType<typeof rabbitSchema>>;

/** "" / null / undefined -> undefined, so an empty optional tagId field doesn't fail validation. */
function optionalTagId(t: Dictionary["validation"]) {
  return z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    tagIdSchema(t.rabbitTagLabel, t).optional()
  );
}

function optionalWeightKg(t: Dictionary["validation"]) {
  return z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().positive(t.weightPositive).optional()
  );
}

/**
 * Fast intake (doe or buck): sex + date + breed always; tagId/weightKg
 * optional — left blank, the rabbit is registered as a juvenile
 * (not yet promoted) with no tag and no weight record.
 */
export function quickRabbitSchema(t: Dictionary["validation"]) {
  return z.object({
    sex: z.enum(["doe", "buck"], { message: t.sexRequired }),
    date: requiredDate(t),
    breed: optionalText,
    tagId: optionalTagId(t),
    weightKg: optionalWeightKg(t),
  });
}

export type QuickRabbitInput = z.infer<ReturnType<typeof quickRabbitSchema>>;

/**
 * Autosave, one field at a time, on /stock: a juvenile's cage number and
 * weight each save independently as soon as they're entered (blurred),
 * rather than requiring both together behind a single submit click —
 * losing an entered value because the user navigated away before clicking
 * a button was a real complaint. Neither field moves the row off /stock by
 * itself — only the explicit "move to herd" button does (see
 * promoteToHerdPen and the `movedToHerdPen` filter on that page's query).
 */
export function saveQuickRabbitCageSchema(t: Dictionary["validation"]) {
  return z.object({
    id: z.string().trim().min(1),
    cage: tagIdSchema(t.cageTagLabel, t),
  });
}

export type SaveQuickRabbitCageInput = z.infer<ReturnType<typeof saveQuickRabbitCageSchema>>;

export function saveQuickRabbitWeightSchema(t: Dictionary["validation"]) {
  return z.object({
    id: z.string().trim().min(1),
    weightKg: z.coerce.number().positive(t.weightPositive),
  });
}

export type SaveQuickRabbitWeightInput = z.infer<ReturnType<typeof saveQuickRabbitWeightSchema>>;

/**
 * Second step of a doe's two-stage intake: she already has a cage number and
 * weight (assigned via finalizeQuickRabbit on /stock) — this assigns her
 * doe number, the number that actually promotes her into the mothers herd,
 * and lets her weight be corrected/updated at the same time (editable, not
 * just a read-only carry-over from the /stock step).
 */
export function finalizeMotherSchema(t: Dictionary["validation"]) {
  return z.object({
    id: z.string().trim().min(1),
    tagId: tagIdSchema(t.motherTagLabel, t),
    weightKg: z.coerce.number().positive(t.weightPositive),
  });
}

export type FinalizeMotherInput = z.infer<ReturnType<typeof finalizeMotherSchema>>;

/** Same idea as finalizeMotherSchema, mirrored for a buck's second intake stage on /bucks. */
export function finalizeBuckSchema(t: Dictionary["validation"]) {
  return z.object({
    id: z.string().trim().min(1),
    tagId: tagIdSchema(t.buckTagLabel, t),
    weightKg: z.coerce.number().positive(t.weightPositive),
  });
}

export type FinalizeBuckInput = z.infer<ReturnType<typeof finalizeBuckSchema>>;

/**
 * Adding a doe straight into the herd from /mothers — unlike quickRabbitSchema
 * (which registers a tagId-less juvenile for later promotion), the tag is
 * required up front since this row is meant to land directly on the mothers
 * table, not go through the /stock intake step first.
 */
export function createMotherSchema(t: Dictionary["validation"]) {
  return z.object({
    tagId: tagIdSchema(t.motherTagLabel, t),
    breed: optionalText,
    weightKg: optionalWeightKg(t),
  });
}

export type CreateMotherInput = z.infer<ReturnType<typeof createMotherSchema>>;

/** Same idea as createMotherSchema, mirrored for adding a buck straight into the herd from /bucks. */
export function createBuckSchema(t: Dictionary["validation"]) {
  return z.object({
    tagId: tagIdSchema(t.buckTagLabel, t),
    breed: optionalText,
    weightKg: optionalWeightKg(t),
  });
}

export type CreateBuckInput = z.infer<ReturnType<typeof createBuckSchema>>;

// Breeding ------------------------------------------------------------------

export function breedingSchema(t: Dictionary["validation"]) {
  return z
    .object({
      buckId: z.string().trim().min(1, t.buckRequired),
      doeId: z.string().trim().min(1, t.doeRequired),
      matingDate: requiredDate(t),
      actualKindlingDate: optionalDate(t),
      outcome: z.enum(BREEDING_OUTCOMES),
      notes: optionalText,
    })
    .refine((d) => d.buckId !== d.doeId, {
      message: t.buckDoeSame,
      path: ["doeId"],
    });
}

export type BreedingInput = z.infer<ReturnType<typeof breedingSchema>>;

// Litter --------------------------------------------------------------------

export function litterSchema(t: Dictionary["validation"]) {
  return z
    .object({
      breedingId: z.string().trim().min(1),
      kindlingDate: requiredDate(t),
      bornAlive: z.coerce.number().int().min(0).default(0),
      bornDead: z.coerce.number().int().min(0).default(0),
      weaned: z.coerce.number().int().min(0).optional(),
      weaningDate: optionalDate(t),
      notes: optionalText,
    })
    .refine((d) => d.weaned === undefined || d.weaned <= d.bornAlive, {
      message: t.weanedExceedsBornAlive,
      path: ["weaned"],
    });
}

export type LitterInput = z.infer<ReturnType<typeof litterSchema>>;

// Fostering -------------------------------------------------------------

export function fosterSchema(t: Dictionary["validation"]) {
  return z
    .object({
      fromTagId: tagIdSchema(t.fromDoeTagLabel, t),
      toTagId: tagIdSchema(t.toDoeTagLabel, t),
      count: z.coerce.number().int().min(1, t.fosterCountMin),
    })
    .refine((d) => d.fromTagId !== d.toTagId, {
      message: t.fosterSameDoe,
      path: ["toTagId"],
    });
}

export type FosterInput = z.infer<ReturnType<typeof fosterSchema>>;

// Weight (dead code — no .safeParse() call site) -----------------------------

export const weightSchema = z.object({
  rabbitId: z.string().trim().min(1),
  date: z.string().trim().min(1),
  // Raw entry; the action converts to grams using the settings unit.
  unit: z.enum(WEIGHT_UNITS),
  kg: z.coerce.number().min(0).optional(),
  lb: z.coerce.number().min(0).optional(),
  oz: z.coerce.number().min(0).optional(),
  notes: optionalText,
});

export type WeightInput = z.infer<typeof weightSchema>;

// Health (dead code — no .safeParse() call site) -----------------------------

export const healthSchema = z.object({
  rabbitId: z.string().trim().min(1),
  date: z.string().trim().min(1),
  type: z.enum(HEALTH_TYPES),
  description: z.string().trim().min(1, "الوصف مطلوب"),
  nextDueDate: z.string().trim().optional(),
});

export type HealthInput = z.infer<typeof healthSchema>;

// Transaction ---------------------------------------------------------------

export function transactionSchema(t: Dictionary["validation"]) {
  return z.object({
    rabbitId: optionalText, // null/undefined = farm-wide
    date: requiredDate(t),
    type: z.enum(TRANSACTION_TYPES),
    category: z.enum(TRANSACTION_CATEGORIES),
    amount: z.coerce.number().positive(t.amountPositive),
    notes: optionalText,
  });
}

export type TransactionInput = z.infer<ReturnType<typeof transactionSchema>>;

// Kit stock movements (weaning sales / post-weaning deaths) -----------------

export function kitSaleSchema(t: Dictionary["validation"]) {
  return z.object({
    date: requiredDate(t),
    count: z.coerce.number().int().min(1, t.fosterCountMin),
    weightKg: z.coerce.number().positive(t.weightPositive),
    pricePerKg: z.coerce.number().positive(t.amountPositive),
    notes: optionalText,
  });
}

export type KitSaleInput = z.infer<ReturnType<typeof kitSaleSchema>>;

// Settings ------------------------------------------------------------------

export function settingsSchema(t: Dictionary["validation"]) {
  return z.object({
    weightUnit: z.enum(WEIGHT_UNITS),
    gestationDays: z.coerce.number().int().min(1).max(60),
    gestationWindowDays: z.coerce.number().int().min(0).max(14),
    pregnancyTestDays: z.coerce.number().int().min(1).max(30),
    weaningDays: z.coerce.number().int().min(0).max(90),
    nestBoxDays: z.coerce.number().int().min(1).max(30),
    matingWeightGrams: z.coerce.number().int().min(1),
    rebreedAfterKindlingDays: z.coerce.number().int().refine(
      (v) => [0, 15, 30].includes(v),
      t.invalidValue
    ),
    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .refine((v) => {
        // Must be a real ISO 4217 code Intl recognizes — a code that merely
        // looks right (e.g. "L.E" for the Egyptian pound) crashes every
        // Intl.NumberFormat call that formats money across the app.
        try {
          new Intl.NumberFormat(undefined, { style: "currency", currency: v });
          return true;
        } catch {
          return false;
        }
      }, t.invalidCurrency),
  });
}

export type SettingsInput = z.infer<ReturnType<typeof settingsSchema>>;

// Breed ---------------------------------------------------------------------

export function breedSchema(t: Dictionary["validation"]) {
  return z.object({
    name: z.string().trim().min(1, t.breedNameRequired).max(50, t.breedNameTooLong),
  });
}

export type BreedInput = z.infer<ReturnType<typeof breedSchema>>;
