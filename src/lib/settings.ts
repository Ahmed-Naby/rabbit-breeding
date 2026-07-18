import "server-only";
import { prisma } from "./prisma";
import { currentFarmId } from "./tenant";
import type { Settings as SettingsRow } from "@/generated/prisma/client";
import type { WeightUnit } from "./enums";

// Derived from the Prisma model instead of hand-listed: a new scalar column
// added to schema.prisma flows through to AppSettings automatically, so this
// file only needs touching when a field's *type* narrows (like weightUnit
// below), not for every new setting.
export type AppSettings = Omit<SettingsRow, "createdAt" | "updatedAt" | "weightUnit"> & {
  weightUnit: WeightUnit;
};

/**
 * Returns the single settings row, creating it with defaults on first access.
 * Kept small and un-cached so changes take effect immediately.
 */
export async function getSettings(): Promise<AppSettings> {
  const farmId = currentFarmId();
  const existing = await prisma.settings.findUnique({ where: { farmId } });
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...row } =
    existing ?? (await prisma.settings.create({ data: { farmId } }));
  return { ...row, weightUnit: row.weightUnit as WeightUnit };
}
