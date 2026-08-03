import { label } from "@/lib/enums";
import type { WeightUnit } from "@/lib/enums";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import type { XlsxColumn, XlsxValue } from "@/lib/xlsx";
import { gramsToKg } from "@/lib/units";
import { buildKitLedgerSheet, type KitLedgerSheetRow } from "@/lib/kit-ledger-sheet";

/**
 * Every log table in the app as a worksheet, in one place.
 *
 * The web bundle and the mobile bundle hold the same records in differently
 * shaped rows — `row.doe.tagId` on one side, `row.doeTagId` on the other — so
 * each caller flattens into the small row types below and the columns, the
 * headers and the order are decided here once. An exported file is then the
 * same file whichever bundle produced it.
 *
 * Values go out as numbers and dates rather than as the strings on screen: an
 * exported table is opened to be summed, sorted and filtered, and none of the
 * three works on «١٦٬٨٨٦٫٥٥ كجم». Units live in the column headers instead.
 */

export type LogSheet = {
  sheetName: string;
  columns: XlsxColumn[];
  rows: XlsxValue[][];
  rightToLeft: boolean;
};

type DateLike = Date | string | null | undefined;

/** The mobile mirror stores dates as ISO strings; the server hands over Dates. */
function asDate(value: DateLike): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const TAG = 12;
const DATE = 13;
const NUM = 9;

const GRAMS_PER_LB = 453.59237;

/** Weights are stored in grams everywhere; the farm's own unit goes in the header. */
function inWeightUnit(grams: number | null | undefined, unit: WeightUnit): number | null {
  if (grams == null) return null;
  const value = unit === "kg" ? gramsToKg(grams) : grams / GRAMS_PER_LB;
  return Math.round(value * 100) / 100;
}

function weightWord(unit: WeightUnit, locale: Locale): string {
  if (unit === "kg") return locale === "ar" ? "كجم" : "kg";
  return locale === "ar" ? "رطل" : "lb";
}

// ── row shapes ───────────────────────────────────────────────────────────────

type DoeAndBuck = {
  doeTag?: string | null;
  breed?: string | null;
  buckTag?: string | null;
};

export type MatingSheetRow = DoeAndBuck & {
  matingDate: DateLike;
  wasNursingAtMating: boolean;
};

export type PregnancyTestSheetRow = DoeAndBuck & {
  matingDate: DateLike;
  testDate: DateLike;
  result: string;
};

export type ResorptionSheetRow = DoeAndBuck & {
  matingDate: DateLike;
  resorptionDate: DateLike;
};

export type KindlingSheetRow = DoeAndBuck & {
  matingDate: DateLike;
  kindlingDate: DateLike;
  bornAlive: number;
  /** `-1` on rows that predate the frozen column — exported blank, not zero. */
  bornDead: number;
};

export type WeaningSheetRow = DoeAndBuck & {
  kindlingDate: DateLike;
  weaningDate: DateLike;
  alive: number;
  /** Deaths during nursing only, as the table shows them. */
  dead: number;
  weaned: number | null;
  weaningWeightGrams: number | null;
  /** 0…1, or null on cycles the rate can't be computed for. */
  survivalRate: number | null;
};

export type FosteringSheetRow = {
  date: DateLike;
  fromTag?: string | null;
  toTag?: string | null;
  count: number;
};

export type KitDeathSheetRow = {
  date: DateLike;
  doeTag?: string | null;
  kindlingDate?: DateLike;
  count: number;
};

export type DailyKitDeathSheetRow = { date: DateLike; count: number };

export type DeceasedTaggedSheetRow = {
  date: DateLike;
  tag?: string | null;
  breed?: string | null;
};

export type DeceasedStockSheetRow = {
  date: DateLike;
  sex: string;
  breed?: string | null;
};

export type CulledSheetRow = DeceasedTaggedSheetRow & { sex: string };

/**
 * Rates arrive as 0…100, not 0…1 — both bundles compute them that way for the
 * `%` on screen. Nulls stay null so «لسه مافيش» isn't averaged as a zero.
 */
export type DoeFertilitySheetRow = {
  tagId: string;
  breed?: string | null;
  status: string;
  doeState: string;
  totalBreedings: number;
  totalKindlings: number;
  fertilityRate: number | null;
  /** «متوسط البطن» — the frozen birth count, unmoved by fostering/deaths. */
  avgBornAtKindling: number | null;
  /** «متوسط عدد الرعاية» — the live nursing count. */
  avgBorn: number | null;
  avgWeaned: number | null;
  /** Grams per kit, not per litter. */
  avgWeaningWeight: number | null;
  weaningSurvivalRate: number | null;
};

export type BuckFertilitySheetRow = {
  tagId: string;
  breed?: string | null;
  status: string;
  totalBreedings: number;
  /** Confirmed pregnancies — a buck's rate is settling rate, not kindlings. */
  totalPregnancies: number;
  fertilityRate: number | null;
  avgBorn: number | null;
  totalBornAtKindling: number;
};

/**
 * A tagged rabbit on the أمهات / ذكور roster. `doeState` is only read for the
 * does sheet — the bucks one has no such column.
 */
export type HerdSheetRow = {
  tagId?: string | null;
  breed?: string | null;
  acquiredDate: DateLike;
  weightGrams: number | null;
  status: string;
  doeState?: string;
};

/** A doe past a full cycle without kindling — the استبعاد shortlist. */
export type IdleDoeSheetRow = {
  tagId?: string | null;
  breed?: string | null;
  lastKindlingDate: DateLike;
  /** True when she has no kindling at all; the date column then goes out blank. */
  neverKindled: boolean;
  idleDays: number;
};

/** An untagged juvenile still on the السلالات intake table. */
export type StockSheetRow = {
  date: DateLike;
  sex: string;
  breed?: string | null;
  cage?: string | null;
  /** Already in kg on both sides — this table never converts on screen either. */
  weightKg: number | null;
};

/**
 * What to export, as data — a plain object rather than a callback, so a server
 * component can hand it to the client button across the RSC boundary.
 */
export type LogSheetSpec =
  | { kind: "mating"; rows: MatingSheetRow[] }
  | { kind: "pregnancyTest"; rows: PregnancyTestSheetRow[] }
  | { kind: "resorption"; rows: ResorptionSheetRow[] }
  | { kind: "kindling"; rows: KindlingSheetRow[] }
  | { kind: "weaning"; rows: WeaningSheetRow[] }
  | { kind: "fostering"; rows: FosteringSheetRow[] }
  | { kind: "nursingKitDeaths"; rows: KitDeathSheetRow[] }
  | { kind: "weanedKitDeaths"; rows: DailyKitDeathSheetRow[] }
  | { kind: "deceasedDoes"; rows: DeceasedTaggedSheetRow[] }
  | { kind: "deceasedBucks"; rows: DeceasedTaggedSheetRow[] }
  | { kind: "deceasedStock"; rows: DeceasedStockSheetRow[] }
  | { kind: "culled"; rows: CulledSheetRow[] }
  | { kind: "doesFertility"; rows: DoeFertilitySheetRow[] }
  | { kind: "bucksFertility"; rows: BuckFertilitySheetRow[] }
  | { kind: "herdDoes"; rows: HerdSheetRow[]; weightUnit: WeightUnit }
  | { kind: "herdBucks"; rows: HerdSheetRow[]; weightUnit: WeightUnit }
  | { kind: "stock"; rows: StockSheetRow[] }
  | { kind: "idleDoes"; rows: IdleDoeSheetRow[] }
  | { kind: "kitLedger"; rows: KitLedgerSheetRow[]; currency: string; weightUnit: WeightUnit };

// ── builders ─────────────────────────────────────────────────────────────────

export function buildLogSheet(spec: LogSheetSpec, locale: Locale): LogSheet {
  const d = getClientDictionary(locale);
  const rightToLeft = locale === "ar";
  const sheet = (sheetName: string, columns: XlsxColumn[], rows: XlsxValue[][]): LogSheet => ({
    sheetName,
    columns,
    rows,
    rightToLeft,
  });

  switch (spec.kind) {
    case "mating": {
      const t = d.mating;
      return sheet(
        t.logHeading,
        [
          { header: t.colMotherTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colBuckTag, format: "text", width: TAG },
          { header: t.colMatingDate, format: "date", width: DATE },
          { header: t.colDoeStateAtMating, format: "text", width: 20 },
        ],
        spec.rows.map((r) => [
          r.doeTag ?? null,
          r.breed ?? null,
          r.buckTag ?? null,
          asDate(r.matingDate),
          label(r.wasNursingAtMating ? "nursing" : "empty", locale),
        ])
      );
    }

    case "pregnancyTest": {
      const t = d.pregnancyTest;
      return sheet(
        t.logHeading,
        [
          { header: t.colMotherTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colBuckTag, format: "text", width: TAG },
          { header: t.colMatingDate, format: "date", width: DATE },
          { header: t.colTestDate, format: "date", width: DATE },
          { header: t.colTestResult, format: "text" },
        ],
        spec.rows.map((r) => [
          r.doeTag ?? null,
          r.breed ?? null,
          r.buckTag ?? null,
          asDate(r.matingDate),
          asDate(r.testDate),
          r.result === "positive" ? t.resultPositive : r.result === "negative" ? t.resultNegative : r.result,
        ])
      );
    }

    case "resorption": {
      const t = d.resorptionLog;
      return sheet(
        t.logHeading,
        [
          { header: t.colMotherTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colBuckTag, format: "text", width: TAG },
          { header: t.colMatingDate, format: "date", width: DATE },
          { header: t.colResorptionDate, format: "date", width: DATE },
        ],
        spec.rows.map((r) => [
          r.doeTag ?? null,
          r.breed ?? null,
          r.buckTag ?? null,
          asDate(r.matingDate),
          asDate(r.resorptionDate),
        ])
      );
    }

    case "kindling": {
      const t = d.kindling;
      return sheet(
        t.logHeading,
        [
          { header: t.colDoeTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colBuckTag, format: "text", width: TAG },
          { header: t.colMatingDate, format: "date", width: DATE },
          { header: t.colKindlingDate, format: "date", width: DATE },
          { header: t.colBornAlive, format: "number", width: NUM },
          { header: t.colBornDead, format: "number", width: NUM },
        ],
        spec.rows.map((r) => [
          r.doeTag ?? null,
          r.breed ?? null,
          r.buckTag ?? null,
          asDate(r.matingDate),
          asDate(r.kindlingDate),
          r.bornAlive,
          // Blank, not 0: these rows predate the column, and a 0 here would be
          // summed as «no stillborns» rather than «not recorded».
          r.bornDead >= 0 ? r.bornDead : null,
        ])
      );
    }

    case "weaning": {
      const t = d.weaning;
      return sheet(
        t.logHeading,
        [
          { header: t.colMotherTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colBuckTag, format: "text", width: TAG },
          { header: t.colKindlingDate, format: "date", width: DATE },
          { header: t.colWeaningDate, format: "date", width: DATE },
          { header: `${t.groupNursingCount} — ${t.colAlive}`, format: "number", width: NUM },
          { header: `${t.groupNursingCount} — ${t.colDead}`, format: "number", width: NUM },
          { header: t.colWeanedCount, format: "number", width: NUM },
          { header: t.colWeaningWeight, format: "number", width: NUM },
          { header: `${t.colSurvivalRate} (%)`, format: "number", width: NUM },
        ],
        spec.rows.map((r) => [
          r.doeTag ?? null,
          r.breed ?? null,
          r.buckTag ?? null,
          asDate(r.kindlingDate),
          asDate(r.weaningDate),
          r.alive,
          r.dead,
          r.weaned,
          r.weaningWeightGrams,
          r.survivalRate != null ? Math.round(r.survivalRate * 100) : null,
        ])
      );
    }

    case "fostering": {
      const t = d.fostering;
      return sheet(
        t.logTitle,
        [
          { header: t.colDate, format: "date", width: DATE },
          { header: t.colFromDoe, format: "text", width: TAG },
          { header: t.colToDoe, format: "text", width: TAG },
          { header: t.colKits, format: "number", width: NUM },
        ],
        spec.rows.map((r) => [
          asDate(r.date),
          r.fromTag ?? null,
          r.toTag ?? null,
          r.count,
        ])
      );
    }

    case "nursingKitDeaths": {
      const t = d.mortality;
      // The mother's kindling date is only on hand in the web bundle; the column
      // is dropped rather than exported as a stripe of blanks.
      const withKindling = spec.rows.some((r) => r.kindlingDate != null);
      const columns: XlsxColumn[] = [
        { header: t.colDeathDate, format: "date", width: DATE },
        { header: t.colMotherTag, format: "text", width: TAG },
        ...(withKindling ? [{ header: t.colKindlingDate, format: "date" as const, width: DATE }] : []),
        { header: t.colCount, format: "number", width: NUM },
      ];
      return sheet(
        t.logTabKitDeaths,
        columns,
        spec.rows.map((r) => [
          asDate(r.date),
          r.doeTag ?? null,
          ...(withKindling ? [asDate(r.kindlingDate)] : []),
          r.count,
        ])
      );
    }

    case "weanedKitDeaths": {
      const t = d.mortality;
      return sheet(
        t.logTabWeanedKitDeaths,
        [
          { header: t.colDeathDate, format: "date", width: DATE },
          { header: t.colCount, format: "number", width: NUM },
        ],
        spec.rows.map((r) => [asDate(r.date), r.count])
      );
    }

    case "deceasedDoes":
    case "deceasedBucks": {
      const t = d.mortality;
      const isDoes = spec.kind === "deceasedDoes";
      return sheet(
        isDoes ? t.logTabDeceasedMothers : t.logTabDeceasedBucks,
        [
          { header: t.colRegisteredDate, format: "date", width: DATE },
          { header: isDoes ? t.colMotherTag : t.colBuckTag, format: "text", width: TAG },
          { header: t.colStrainBreed, format: "text" },
        ],
        spec.rows.map((r) => [asDate(r.date), r.tag ?? null, r.breed ?? null])
      );
    }

    case "deceasedStock": {
      const t = d.mortality;
      return sheet(
        t.logTabDeceasedStrains,
        [
          { header: t.colRegisteredDate, format: "date", width: DATE },
          { header: t.colSex, format: "text" },
          { header: t.colStrainBreed, format: "text" },
        ],
        spec.rows.map((r) => [asDate(r.date), label(r.sex, locale), r.breed ?? null])
      );
    }

    case "culled": {
      const t = d.mortality;
      return sheet(
        t.culledHeading,
        [
          { header: t.colRegisteredDate, format: "date", width: DATE },
          { header: t.colTag, format: "text", width: TAG },
          { header: t.colSex, format: "text" },
          { header: t.colStrainBreed, format: "text" },
        ],
        spec.rows.map((r) => [asDate(r.date), r.tag ?? null, label(r.sex, locale), r.breed ?? null])
      );
    }

    case "doesFertility": {
      const t = d.doesFertility;
      // Wider than the log sheets': these headers are whole phrases
      // («متوسط عدد الرعاية»), not one-word column names.
      const STAT = 18;
      return sheet(
        t.title,
        [
          { header: t.colDoeTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colStatus, format: "text" },
          { header: t.colDoeState, format: "text", width: 16 },
          { header: t.colBreedings, format: "number", width: STAT },
          { header: t.colKindlings, format: "number", width: STAT },
          { header: `${t.colFertilityRate} (%)`, format: "number", width: STAT },
          { header: t.colAvgBornAtKindling, format: "decimal", width: STAT },
          { header: t.colAvgBorn, format: "decimal", width: STAT },
          { header: t.colAvgWeaned, format: "decimal", width: STAT },
          // The unit is already in this one's label.
          { header: t.colAvgWeaningWeight, format: "number", width: STAT },
          { header: `${t.colWeaningSurvivalRate} (%)`, format: "number", width: STAT },
        ],
        spec.rows.map((r) => [
          r.tagId,
          r.breed ?? null,
          label(r.status, locale),
          label(r.doeState, locale),
          r.totalBreedings,
          r.totalKindlings,
          // Rounded as the table prints them; the averages keep their decimals.
          r.fertilityRate != null ? Math.round(r.fertilityRate) : null,
          r.avgBornAtKindling,
          r.avgBorn,
          r.avgWeaned,
          r.avgWeaningWeight != null ? Math.round(r.avgWeaningWeight) : null,
          r.weaningSurvivalRate != null ? Math.round(r.weaningSurvivalRate) : null,
        ])
      );
    }

    case "bucksFertility": {
      const t = d.bucksFertility;
      const STAT = 18;
      return sheet(
        t.title,
        [
          { header: t.colBuckTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colStatus, format: "text" },
          { header: t.colBreedings, format: "number", width: STAT },
          { header: t.colPregnancies, format: "number", width: STAT },
          { header: `${t.colFertilityRate} (%)`, format: "number", width: STAT },
          { header: t.colAvgBorn, format: "decimal", width: STAT },
          { header: t.colTotalBorn, format: "number", width: STAT },
        ],
        spec.rows.map((r) => [
          r.tagId,
          r.breed ?? null,
          label(r.status, locale),
          r.totalBreedings,
          r.totalPregnancies,
          r.fertilityRate != null ? Math.round(r.fertilityRate) : null,
          r.avgBorn,
          r.totalBornAtKindling,
        ])
      );
    }

    case "herdDoes":
    case "herdBucks": {
      const isDoes = spec.kind === "herdDoes";
      const t = isDoes ? d.mothers : d.bucks;
      const unit = weightWord(spec.weightUnit, locale);
      return sheet(
        t.title,
        [
          { header: t.colTag, format: "text", width: TAG },
          { header: t.colBreed, format: "text" },
          { header: t.colAddedDate, format: "date", width: 22 },
          { header: `${t.colWeight} (${unit})`, format: "decimal", width: NUM },
          { header: t.colStatus, format: "text" },
          // The reproductive state only exists on the does side.
          ...(isDoes ? [{ header: d.mothers.colDoeState, format: "text" as const, width: 16 }] : []),
        ],
        spec.rows.map((r) => [
          r.tagId ?? null,
          r.breed ?? null,
          asDate(r.acquiredDate),
          inWeightUnit(r.weightGrams, spec.weightUnit),
          label(r.status, locale),
          ...(isDoes ? [r.doeState ? label(r.doeState, locale) : null] : []),
        ])
      );
    }

    case "stock": {
      const t = d.stock;
      return sheet(
        t.title,
        [
          { header: t.colDate, format: "date", width: DATE },
          { header: t.colSex, format: "text" },
          { header: t.colBreed, format: "text" },
          { header: t.colCage, format: "text", width: TAG },
          { header: `${t.colWeight} (${locale === "ar" ? "كجم" : "kg"})`, format: "decimal", width: NUM },
        ],
        spec.rows.map((r) => [
          asDate(r.date),
          label(r.sex, locale),
          r.breed ?? null,
          r.cage ?? null,
          r.weightKg,
        ])
      );
    }

    case "idleDoes": {
      const t = d.reports;
      return sheet(
        t.herdSectionIdle,
        [
          { header: t.herdColTag, format: "text", width: TAG },
          { header: t.herdColBreed, format: "text" },
          { header: t.herdColLastKindling, format: "date", width: DATE },
          { header: t.herdColIdleDays, format: "number", width: 16 },
        ],
        spec.rows.map((r) => [
          r.tagId ?? null,
          r.breed ?? null,
          // A date column stays a date, so «لم تلد إطلاقًا» goes out blank
          // rather than as text; أيام بلا ولادة still carries her number.
          r.neverKindled ? null : asDate(r.lastKindlingDate),
          r.idleDays,
        ])
      );
    }

    case "kitLedger":
      return buildKitLedgerSheet({
        rows: spec.rows,
        locale,
        currency: spec.currency,
        weightUnit: spec.weightUnit,
      });
  }
}

/** `rabbittrack-سجل-التلقيح-2026-08-03.xlsx` */
export function logSheetFilename(sheetName: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const slug = sheetName.trim().replace(/\s+/g, "-");
  return `rabbittrack-${slug}-${day}.xlsx`;
}
