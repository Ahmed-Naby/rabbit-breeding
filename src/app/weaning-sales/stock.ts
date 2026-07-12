import { prisma } from "@/lib/prisma";

export type LedgerEntry = {
  key: string;
  date: Date;
  kind: "wean" | "sale" | "death";
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
  const [weanedLitters, movements] = await Promise.all([
    prisma.litter.findMany({
      where: { weaningDate: { not: null }, weaned: { not: null } },
      select: { weaningDate: true, weaned: true },
    }),
    prisma.kitStockMovement.findMany({ orderBy: { date: "desc" } }),
  ]);

  // Weaned counts aren't stored on KitStockMovement — they're derived from
  // Litter rows grouped by weaning day, so the ledger always reflects
  // /weaning without a second source of truth.
  const weanedByDay = new Map<string, { date: Date; count: number }>();
  for (const l of weanedLitters) {
    if (!l.weaningDate || l.weaned == null) continue;
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
      kind: m.type as "sale" | "death",
      count: -m.count,
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
  const totalRevenueCents = movements
    .filter((m) => m.type === "sale")
    .reduce((s, m) => s + (m.amountCents ?? 0), 0);
  const availableStock = totalWeaned - totalSold - totalDied;

  return { ledger, totalWeaned, totalSold, totalDied, totalRevenueCents, availableStock };
}
