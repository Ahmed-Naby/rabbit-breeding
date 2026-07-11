import "server-only";
import { prisma } from "./prisma";
import type { WeightUnit } from "./enums";

export type AppSettings = {
  id: number;
  weightUnit: WeightUnit;
  gestationDays: number;
  gestationWindowDays: number;
  pregnancyTestDays: number;
  weaningDays: number;
  nestBoxDays: number;
  matingWeightGrams: number;
  currency: string;
};

/**
 * Returns the single settings row, creating it with defaults on first access.
 * Kept small and un-cached so changes take effect immediately.
 */
export async function getSettings(): Promise<AppSettings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  const row =
    existing ?? (await prisma.settings.create({ data: { id: 1 } }));
  return {
    id: row.id,
    weightUnit: row.weightUnit as WeightUnit,
    gestationDays: row.gestationDays,
    gestationWindowDays: row.gestationWindowDays,
    pregnancyTestDays: row.pregnancyTestDays,
    weaningDays: row.weaningDays,
    nestBoxDays: row.nestBoxDays,
    matingWeightGrams: row.matingWeightGrams,
    currency: row.currency,
  };
}
