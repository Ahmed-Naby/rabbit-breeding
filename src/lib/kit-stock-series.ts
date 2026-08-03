/**
 * The «رصيد الفطام» balance over the farm's whole life, as chartable points.
 *
 * Shared like breeding-averages.ts: the web feeds it Prisma rows and mobile
 * feeds it local SQLite rows, and both must draw the same curve. The balance
 * itself is the same formula getKitStockBalanceAsOf computes for a single
 * instant — weanings in, sales/deaths/retentions out, returns and signed
 * adjustments on top — replayed as a running total instead of summed once.
 */

import { doesPresentOn, type DoePresence } from "./breeding-averages";

/** One dated change to the balance. `delta` is already signed by the caller. */
export type KitStockEvent = { dateMs: number; delta: number };

export type KitStockPoint = { dateMs: number; balance: number };

/** Bucket widths, coarsest last. `month` is calendar-aware, the rest are fixed. */
export type KitStockBucket = "day" | "week" | "month";

const DAY_MS = 86_400_000;

/**
 * At most this many plotted points. A farm three years in has ~1100 days of
 * history; drawing every one of them is unreadable on a phone and slow, so the
 * bucket widens until the series fits.
 */
const MAX_POINTS = 60;

function endOfMonth(ms: number): number {
  const d = new Date(ms);
  // Day 0 of the next month is the last day of this one.
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

function nextMonthEnd(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59, 999).getTime();
}

/**
 * The narrowest bucket that keeps the series inside MAX_POINTS. The span is
 * compared against MAX_POINTS - 1 because the series carries one point per
 * boundary PLUS the opening one at the first event.
 */
export function pickBucket(spanMs: number): KitStockBucket {
  if (spanMs / DAY_MS <= MAX_POINTS - 1) return "day";
  if (spanMs / (DAY_MS * 7) <= MAX_POINTS - 1) return "week";
  return "month";
}

/**
 * Replays `events` into a closing balance per bucket, ending at `nowMs`.
 *
 * The last point is always the balance right now, whatever the bucket — that is
 * the number the رصيد الفطام card shows, and a chart whose final point
 * disagreed with the card by a few days of sales would look like a bug.
 *
 * Buckets with no events still get a point: a flat stretch means the farm sold
 * nothing and weaned nothing, which is information, not missing data.
 */
export function buildKitStockSeries(
  events: KitStockEvent[],
  nowMs: number
): { points: KitStockPoint[]; bucket: KitStockBucket } {
  const sorted = events.slice().sort((a, b) => a.dateMs - b.dateMs);
  if (sorted.length === 0) return { points: [], bucket: "month" };

  const startMs = sorted[0].dateMs;
  const bucket = pickBucket(Math.max(nowMs - startMs, 0));

  // Bucket boundaries, each the last instant covered by that point. The first
  // one sits ON the first event so the curve opens at the farm's first weaning
  // rather than one bucket after it.
  const edges: number[] = [];
  if (bucket === "month") {
    for (let edge = endOfMonth(startMs); edge < nowMs; edge = nextMonthEnd(edge)) edges.push(edge);
  } else {
    const step = bucket === "day" ? DAY_MS : DAY_MS * 7;
    for (let edge = startMs; edge < nowMs; edge += step) edges.push(edge);
  }
  edges.push(nowMs);

  const points: KitStockPoint[] = [];
  let balance = 0;
  let i = 0;
  for (const edge of edges) {
    while (i < sorted.length && sorted[i].dateMs <= edge) {
      balance += sorted[i].delta;
      i++;
    }
    points.push({ dateMs: edge, balance });
  }
  // Events dated in the future (back-dated entry the other way round) would
  // otherwise be silently dropped from the final balance.
  while (i < sorted.length) {
    balance += sorted[i].delta;
    i++;
  }
  points[points.length - 1] = { dateMs: nowMs, balance };

  return { points, bucket };
}

/**
 * One calendar month. `monthMs` is midnight on the 1st, which is also the
 * instant `does` is measured at — the same instant معدل البيع لكل أم divides by.
 */
export type MonthlySalesPoint = { monthMs: number; count: number; does: number };

/**
 * Sales bucketed into calendar months, one bar per month, with the herd that
 * produced them alongside — the counterpart to the balance curve: that one
 * shows what is standing in the barn, this one shows what left it and how many
 * mothers it took.
 *
 * NOT bucketed like buildKitStockSeries. A month is the unit the user asked
 * for and the unit every sales average on this page already uses, so a farm
 * five years in gets 60 bars rather than a coarser width.
 *
 * Months with no sales are emitted as 0 rather than skipped: a gap on the axis
 * would compress the timeline and make a quiet spring look like it never
 * happened. The running month is left out for the same reason the averages
 * leave it out — a few days of sales next to full months reads as a collapse.
 *
 * The series STARTS at the first month with a sale — the same month
 * computeSalesPerDoe starts averaging at, so the per-month figures drawn over
 * these bars average to exactly the «معدل البيع لكل أم» card. Both were briefly
 * anchored on the first doe instead; that counted the ramp-up wait for the
 * first litter as zeros and measured the wrong thing.
 */
export function buildMonthlySalesSeries(
  sales: { dateMs: number; count: number }[],
  does: DoePresence[],
  nowMs: number
): MonthlySalesPoint[] {
  if (sales.length === 0) return [];

  const monthStartOf = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  };

  const byMonth = new Map<number, number>();
  for (const s of sales) {
    const key = monthStartOf(s.dateMs);
    byMonth.set(key, (byMonth.get(key) ?? 0) + s.count);
  }

  // A sale row of 0 head does not open the series: computeSalesPerDoe anchors
  // on the first month that actually sold, and the two must not disagree.
  const sellingMonths = [...byMonth].filter(([, count]) => count > 0).map(([ms]) => ms);
  if (sellingMonths.length === 0) return [];
  const firstMs = Math.min(...sellingMonths);
  const now = new Date(nowMs);
  const currentMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const points: MonthlySalesPoint[] = [];
  for (
    let cursor = new Date(firstMs);
    cursor.getTime() < currentMonthMs;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const monthMs = cursor.getTime();
    points.push({
      monthMs,
      count: byMonth.get(monthMs) ?? 0,
      // Measured on the 1st, exactly as computeSalesPerDoe measures it, so a
      // reader can divide one bar by the other and land on that average.
      does: doesPresentOn(does, monthMs),
    });
  }
  return points;
}

/**
 * Movement types that ADD to the balance. Everything else in KitStockMovement
 * takes away — see getKitStockBalanceAsOf, whose signs these mirror exactly.
 * `adjustment` is a signed manual correction, so it is added as stored.
 */
export function movementDelta(type: string, count: number): number {
  if (type === "returned" || type === "adjustment") return count;
  if (type === "sale" || type === "death" || type === "retained") return -count;
  // Unknown type: leave the balance alone rather than guess a direction.
  return 0;
}
