import type { LedgerKind } from "./kit-ledger";
import type { WeightUnit } from "./enums";
import type { Locale } from "./i18n/locales";
import { getClientDictionary } from "./i18n/dictionaries";
import { gramsToKg } from "./units";
import type { XlsxColumn, XlsxValue } from "./xlsx";

/**
 * The الفطام والبيع ledger as a worksheet, shared by the web page and the mobile
 * one so an exported file is the same file whichever bundle produced it.
 *
 * Values go out as numbers and dates, not as the strings on screen: an exported
 * table is opened to be summed, sorted and filtered, and «١٦٬٨٨٦٫٥٥ كجم» can do
 * none of the three. The unit and the currency move into the column headers
 * instead, where they're read once.
 */

export type KitLedgerSheetRow = {
  date: Date | string;
  kind: LedgerKind;
  /** Signed as the table shows it: a بيع is negative. */
  count: number;
  weightGrams?: number | null;
  pricePerKgCents?: number | null;
  amountCents?: number | null;
  notes?: string | null;
};

const GRAMS_PER_LB = 453.59237;

/** Two decimals, and never the -0 that a negative zero would otherwise print. */
function round2(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

export function buildKitLedgerSheet({
  rows,
  locale,
  currency,
  weightUnit,
}: {
  rows: KitLedgerSheetRow[];
  locale: Locale;
  currency: string;
  weightUnit: WeightUnit;
}): { sheetName: string; columns: XlsxColumn[]; rows: XlsxValue[][]; rightToLeft: boolean } {
  const t = getClientDictionary(locale).weaningSales;
  const unitWord = weightUnit === "kg" ? (locale === "ar" ? "كجم" : "kg") : locale === "ar" ? "رطل" : "lb";

  const kindLabels: Record<LedgerKind, string> = {
    wean: t.typeWean,
    sale: t.typeSale,
    death: t.typeDeath,
    retained: t.typeRetained,
    adjustment: t.typeAdjustment,
    returned: t.typeReturned,
  };

  const columns: XlsxColumn[] = [
    { header: t.colDate, format: "date", width: 12 },
    { header: t.colType, format: "text", width: 14 },
    { header: t.colCount, format: "number", width: 8 },
    { header: `${t.colWeight} (${unitWord})`, format: "decimal", width: 14 },
    { header: `${t.colPricePerKg} (${currency})`, format: "decimal", width: 16 },
    { header: `${t.colAmount} (${currency})`, format: "decimal", width: 16 },
    { header: t.colNotes, format: "text", width: 30 },
  ];

  const sheetRows: XlsxValue[][] = rows.map((row) => [
    row.date instanceof Date ? row.date : new Date(row.date),
    kindLabels[row.kind],
    row.count,
    row.weightGrams != null
      ? round2(weightUnit === "kg" ? gramsToKg(row.weightGrams) : row.weightGrams / GRAMS_PER_LB)
      : null,
    row.pricePerKgCents != null ? round2(row.pricePerKgCents / 100) : null,
    row.amountCents != null ? round2(row.amountCents / 100) : null,
    row.notes ?? null,
  ]);

  return { sheetName: t.title, columns, rows: sheetRows, rightToLeft: locale === "ar" };
}

/** `rabbittrack-الفطام-والبيع-2026-02-08.xlsx` */
export function kitLedgerFilename(locale: Locale): string {
  const day = new Date().toISOString().slice(0, 10);
  const name = locale === "ar" ? "الفطام-والبيع" : "kit-ledger";
  return `rabbittrack-${name}-${day}.xlsx`;
}
