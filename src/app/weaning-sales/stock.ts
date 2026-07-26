import { prisma } from "@/lib/prisma";

export type LedgerEntry = {
  key: string;
  date: Date;
  kind: "wean" | "sale" | "death" | "retained" | "adjustment" | "returned";
  count: number; // signed: positive for wean, negative for sale/death
  weightGrams?: number | null;
  pricePerKgCents?: number | null;
  amountCents?: number | null;
  notes?: string | null;
  id?: string; // KitStockMovement id, for delete
};

/**
 * Shared by /weaning-sales (full ledger + cards) and /mortality (just
 * availableStock, for the "نافق الفطام" counter) so both pages agree on the
 * same weaned/sold/died math from a single source of truth.
 */
export async function getKitStockSummary() {
  const [weanings, movements] = await Promise.all([
    prisma.weaningLog.findMany({
      where: { weaned: { not: null } },
      select: { weaningDate: true, weaned: true },
    }),
    prisma.kitStockMovement.findMany({ orderBy: { date: "desc" } }),
  ]);

  // Weaned counts aren't stored on KitStockMovement — they're derived from the
  // weaning archive grouped by weaning day, so the ledger always reflects
  // سجل الفطام without a second source of truth.
  //
  // WeaningLog, NOT Litter: a Breeding row (and its 1:1 Litter) is reused every
  // cycle, and markKindled nulls weaningDate/weaned on the next birth. Counting
  // Litter therefore lost a weaning the moment the doe kindled again, and
  // collapsed a doe's repeated weanings into the one surviving row — the real
  // farm's 9 weanings / 29 kits read as 2 rows / 8 kits, which then gated
  // sales through availableStock below. WeaningLog is append-only (written at
  // the «فطام» press, later عدد/وزن edits mirrored into it via updateMany), so
  // one row per weaning event survives every later cycle.
  const weanedByDay = new Map<string, { date: Date; count: number }>();
  for (const l of weanings) {
    if (l.weaned == null) continue;
    const key = l.weaningDate.toISOString().slice(0, 10);
    const existing = weanedByDay.get(key);
    if (existing) existing.count += l.weaned;
    else weanedByDay.set(key, { date: l.weaningDate, count: l.weaned });
  }

  const ledger: LedgerEntry[] = [
    ...Array.from(weanedByDay.entries()).map(([key, v]) => ({
      key: `wean-${key}`,
      date: v.date,
      kind: "wean" as const,
      count: v.count,
    })),
    ...movements.map((m) => ({
      key: `move-${m.id}`,
      date: m.date,
      kind: m.type as "sale" | "death" | "retained" | "adjustment" | "returned",
      // Sale/death/retained withdraw (shown negative); a "returned" سلالة adds
      // back; an adjustment carries its own sign and is shown as stored.
      count: m.type === "adjustment" ? m.count : m.type === "returned" ? m.count : -m.count,
      weightGrams: m.weightGrams,
      pricePerKgCents: m.pricePerKgCents,
      amountCents: m.amountCents,
      notes: m.notes,
      id: m.id,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalWeaned = Array.from(weanedByDay.values()).reduce((s, v) => s + v.count, 0);
  const totalSold = movements
    .filter((m) => m.type === "sale")
    .reduce((s, m) => s + m.count, 0);
  const totalDied = movements
    .filter((m) => m.type === "death")
    .reduce((s, m) => s + m.count, 0);
  const totalRetained = movements
    .filter((m) => m.type === "retained")
    .reduce((s, m) => s + m.count, 0);
  const totalRevenueCents = movements
    .filter((m) => m.type === "sale")
    .reduce((s, m) => s + (m.amountCents ?? 0), 0);
  // Signed manual corrections to the opening/available balance.
  const totalAdjustment = movements
    .filter((m) => m.type === "adjustment")
    .reduce((s, m) => s + m.count, 0);
  // سلالات that were deleted and sent back to the weaning cages. Counted for
  // purchased سلالات too, even though those were never weaned here — they're
  // physically in the pen now, and the balance follows the pen.
  const totalReturned = movements
    .filter((m) => m.type === "returned")
    .reduce((s, m) => s + m.count, 0);
  const availableStock =
    totalWeaned - totalSold - totalDied - totalRetained + totalAdjustment + totalReturned;

  return {
    ledger,
    totalWeaned,
    totalSold,
    totalDied,
    totalRetained,
    totalReturned,
    totalRevenueCents,
    availableStock,
  };
}
