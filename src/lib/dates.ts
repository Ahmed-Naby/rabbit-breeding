import { addDays, differenceInCalendarDays } from "date-fns";
import type { Locale } from "./i18n/locales";

// Dates are stored in UTC. Display formatting that must be locale-aware and
// hydration-safe is done in the <LocalDate> client component; these helpers are
// for pure date math and for value/label formatting that is TZ-agnostic.

/** Expected kindling date = mating date + gestation days. */
export function expectedKindling(matingDate: Date, gestationDays: number): Date {
  return addDays(matingDate, gestationDays);
}

/** Pregnancy test (palpation) date = mating date + offset days (default 10). */
export function pregnancyTestDate(matingDate: Date, offsetDays = 10): Date {
  return addDays(matingDate, offsetDays);
}

/** Earliest weaning date = kindling date + offset days (default 28). */
export function weaningDueDate(kindlingDate: Date, offsetDays = 28): Date {
  return addDays(kindlingDate, offsetDays);
}

/** Nest box installation date = mating date + offset days (default 27). */
export function nestBoxDueDate(matingDate: Date, offsetDays = 27): Date {
  return addDays(matingDate, offsetDays);
}

/** Earliest rebreed date for a nursing doe = kindling date + offset days. */
export function rebreedDueDate(kindlingDate: Date, offsetDays: number): Date {
  return addDays(kindlingDate, offsetDays);
}

/**
 * Classify how a due/expected date relates to today, for dashboard badges.
 * `windowDays` widens the "due soon" band (used for the kindling window).
 */
export function dueStatus(
  target: Date,
  today: Date = new Date(),
  windowDays = 0
): "overdue" | "due" | "upcoming" | "future" {
  const days = differenceInCalendarDays(target, today);
  if (days < -windowDays) return "overdue";
  if (days <= windowDays) return "due";
  if (days <= 7) return "upcoming";
  return "future";
}

/** Days until (positive) or since (negative) the target date. */
export function daysUntil(target: Date, today: Date = new Date()): number {
  return differenceInCalendarDays(target, today);
}

/** Format a Date as yyyy-MM-dd in LOCAL time for <input type="date"> values. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a yyyy-MM-dd string from a date input into a Date at UTC midnight,
 * so a "birthday" doesn't drift across timezones on round-trip.
 */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Weaning survival rate as a 0–1 fraction (weaned / born alive), or null. */
export function survivalRate(
  bornAlive: number,
  weaned: number | null | undefined
): number | null {
  if (weaned == null || bornAlive <= 0) return null;
  return Math.min(1, weaned / bornAlive);
}

const AGE_UNITS: Record<
  Locale,
  { day: (n: number) => string; month: (n: number) => string; year: (n: number) => string }
> = {
  ar: {
    day: (n) => `${n} يوم`,
    month: (n) => `${n} شهر`,
    year: (n) => `${n} سنة`,
  },
  en: {
    day: (n) => `${n} day${n === 1 ? "" : "s"}`,
    month: (n) => `${n} month${n === 1 ? "" : "s"}`,
    year: (n) => `${n} year${n === 1 ? "" : "s"}`,
  },
};

/** Age in a compact human string, e.g. "3 شهر", "سنة 2 شهر", "12 يوم". */
export function ageString(
  dob: Date | null | undefined,
  now = new Date(),
  locale: Locale = "ar"
): string {
  if (!dob) return "—";
  const days = differenceInCalendarDays(now, dob);
  if (days < 0) return "—";
  const u = AGE_UNITS[locale];
  if (days < 60) return u.day(days);
  const months = Math.floor(days / 30.44);
  if (months < 24) return u.month(months);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${u.year(years)} ${u.month(rem)}` : u.year(years);
}
