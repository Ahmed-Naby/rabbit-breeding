import type { WeightUnit } from "./enums";

// --- Weight ---------------------------------------------------------------
// Canonical storage is integer grams. These helpers convert to/from the two
// display systems and format for output.

const GRAMS_PER_KG = 1000;
const GRAMS_PER_LB = 453.59237;
const GRAMS_PER_OZ = 28.349523125;

/** Parse a user-entered weight (in the given unit) into integer grams. */
export function toGrams(
  value: { kg?: number; lb?: number; oz?: number },
  unit: WeightUnit
): number {
  if (unit === "kg") {
    return Math.round((value.kg ?? 0) * GRAMS_PER_KG);
  }
  const lb = value.lb ?? 0;
  const oz = value.oz ?? 0;
  return Math.round(lb * GRAMS_PER_LB + oz * GRAMS_PER_OZ);
}

/** Convert grams to a kg number (for chart axes / raw values). */
export function gramsToKg(grams: number): number {
  return grams / GRAMS_PER_KG;
}

/** Split grams into whole pounds + remaining ounces. */
export function gramsToLbOz(grams: number): { lb: number; oz: number } {
  const totalOz = grams / GRAMS_PER_OZ;
  const lb = Math.floor(totalOz / 16);
  const oz = totalOz - lb * 16;
  return { lb, oz: Math.round(oz * 10) / 10 };
}

/** Format grams for display in the user's preferred unit. */
export function formatWeight(grams: number, unit: WeightUnit): string {
  if (unit === "kg") {
    return `${(grams / GRAMS_PER_KG).toFixed(3).replace(/\.?0+$/, "")} كجم`;
  }
  const { lb, oz } = gramsToLbOz(grams);
  if (lb === 0) return `${oz} أونصة`;
  return `${lb} رطل ${oz} أونصة`;
}

// --- Money ----------------------------------------------------------------
// Canonical storage is integer cents.

/** Parse a decimal amount (e.g. 12.50) into integer cents. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Format integer cents as a currency string in the user's locale. Falls back
 * to a plain "<code> <amount>" format for a currency code Intl doesn't
 * recognize (e.g. stale/invalid data in Settings.currency) instead of
 * throwing and taking down the whole page.
 */
export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
