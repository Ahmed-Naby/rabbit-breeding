import { expectedKindling, pregnancyTestDate, weaningDueDate, nestBoxDueDate } from "./dates";

export interface BaseLitter {
  bornAlive: number;
  bornDead: number;
  weaningDate?: Date | string | null;
}

export interface BaseBreeding {
  id: string;
  matingDate?: Date | string | null;
  expectedKindlingDate?: Date | string | null;
  actualKindlingDate?: Date | string | null;
  nestBoxDate?: Date | string | null;
  pregnancyTestResult?: string | null;
  litter?: BaseLitter | null;
  buck?: { tagId: string | null } | null;
}

export function parseDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(d);
}

/**
 * Resolves the ongoing nursing litter row for a doe, taking into account
 * lookahead for a newer mating attempt that has not kindled yet.
 */
export function resolveNursingLitterRow(
  breedings: BaseBreeding[]
): BaseBreeding | null {
  if (breedings.length === 0) return null;
  const b = breedings[0];
  const prev = breedings[1];

  const prevOngoingLitter =
    !!prev &&
    !!prev.actualKindlingDate &&
    (!prev.litter || !prev.litter.weaningDate) &&
    !b.actualKindlingDate;

  return prevOngoingLitter ? prev : b;
}

export function isNestBoxCandidate(
  breeding: BaseBreeding,
  nestBoxDays: number,
  today = new Date()
): boolean {
  const mating = parseDate(breeding.matingDate);
  if (!mating || breeding.actualKindlingDate || breeding.nestBoxDate) return false;
  const dueDate = nestBoxDueDate(mating, nestBoxDays);
  const checkDay = new Date(today);
  checkDay.setHours(23, 59, 59, 999);
  return dueDate <= checkDay;
}

export function isWeaningCandidate(
  breeding: BaseBreeding,
  weaningDays: number,
  today = new Date()
): boolean {
  const kindled = parseDate(breeding.actualKindlingDate);
  if (!kindled || (breeding.litter && breeding.litter.weaningDate)) return false;
  const dueDate = weaningDueDate(kindled, weaningDays);
  const checkDay = new Date(today);
  checkDay.setHours(23, 59, 59, 999);
  return dueDate <= checkDay;
}

export function isPregnancyTestCandidate(
  breeding: BaseBreeding,
  pregnancyTestDays: number,
  today = new Date()
): boolean {
  const mating = parseDate(breeding.matingDate);
  if (!mating || breeding.actualKindlingDate) return false;
  const testDate = pregnancyTestDate(mating, pregnancyTestDays);
  const checkDay = new Date(today);
  checkDay.setHours(23, 59, 59, 999);
  return testDate <= checkDay;
}

export function isKindlingCandidate(
  breeding: BaseBreeding,
  gestationDays: number,
  today = new Date()
): boolean {
  const mating = parseDate(breeding.matingDate);
  if (!mating || breeding.actualKindlingDate) return false;
  const dueDate = expectedKindling(mating, gestationDays);
  const checkDay = new Date(today);
  checkDay.setHours(23, 59, 59, 999);
  return dueDate <= checkDay;
}

export function isNursingKitDeathCandidate(
  breeding: BaseBreeding
): boolean {
  const litter = breeding.litter;
  if (!litter || litter.weaningDate || litter.bornAlive <= 0) return false;
  return true;
}
