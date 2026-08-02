/**
 * Period totals for the weaned-kit ledger (صفحة الفطام والبيع).
 *
 * Derived from the ledger *rows* rather than re-queried, so the cards can be
 * recomputed for whatever slice is on screen — a date filter narrows the rows
 * and the four cards follow, with no second definition of "sold" or "died" to
 * drift from the table underneath.
 *
 * Deliberately NOT the available balance. That one is a running stock level,
 * not a period figure: «المخزون المتاح حاليًا» is what stands in the pen today,
 * and every entry on the page is gated on it, so it must always be computed
 * over the whole ledger — see getKitStockSummary.
 *
 * Shared by the web page and the mobile mirror so the two agree.
 */

export type LedgerKind = "wean" | "sale" | "death" | "retained" | "adjustment" | "returned";

/** As rendered in the table: sale/death/retained are already negative. */
export type LedgerTotalsRow = {
  kind: LedgerKind;
  count: number;
  amountCents?: number | null;
  weightGrams?: number | null;
};

export function ledgerTotals(rows: LedgerTotalsRow[]) {
  let totalWeaned = 0;
  let totalSold = 0;
  let totalDied = 0;
  let totalRetained = 0;
  let totalReturned = 0;
  let totalRevenueCents = 0;
  let totalSoldWeightGrams = 0;
  // Heads on *weighed* sale rows only. Weight is optional on a بيع, and
  // dividing the weight by every head sold would quietly drag the average down
  // for each unweighed one — an average of what was actually put on the scale
  // is the honest figure.
  let weighedSoldCount = 0;

  for (const row of rows) {
    switch (row.kind) {
      case "wean":
        totalWeaned += row.count;
        break;
      case "sale":
        totalSold -= row.count;
        totalRevenueCents += row.amountCents ?? 0;
        if (row.weightGrams != null) {
          totalSoldWeightGrams += row.weightGrams;
          weighedSoldCount -= row.count;
        }
        break;
      case "death":
        totalDied -= row.count;
        break;
      case "retained":
        totalRetained -= row.count;
        break;
      case "returned":
        totalReturned += row.count;
        break;
      // تسوية has no card of its own — it moves the balance, which is not a
      // period figure and is never recomputed from a filtered slice.
      case "adjustment":
        break;
    }
  }

  return {
    totalWeaned,
    totalSold,
    totalDied,
    totalRetained,
    totalReturned,
    totalRevenueCents,
    totalSoldWeightGrams,
    /** Per head, null when nothing sold was weighed. */
    avgSoldWeightGrams: weighedSoldCount > 0 ? totalSoldWeightGrams / weighedSoldCount : null,
  };
}
