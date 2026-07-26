import { prisma } from "@/lib/prisma";

/**
 * One نافق نتاج event, from either of the two places a kit death is recorded.
 *
 * The two stages deliberately live in different tables and are only merged for
 * display: a nursing death moves counts on the doe's litter (KitDeathLog is the
 * archive of that press), while a death after weaning is a deduction from رصيد
 * الفطام and therefore has to stay a KitStockMovement row — that table IS the
 * balance. Writing either one twice would create two ledgers that drift.
 */
export type KitDeathRow = {
  id: string;
  date: Date;
  stage: "nursing" | "weaned";
  count: number;
  /** Nursing deaths only — رصيد الفطام is a farm-wide pool with no mother. */
  doeId: string | null;
  doeTag: string | null;
  kindlingDate: Date | null;
};

type DateWhere = { gte?: Date; lt?: Date } | undefined;

/** نافق النتاج (رضاعة + فطام) newest-first, optionally bounded by a date range. */
export async function getKitDeathRows(dateWhere?: DateWhere): Promise<KitDeathRow[]> {
  const [nursing, weaned] = await Promise.all([
    prisma.kitDeathLog.findMany({
      where: dateWhere ? { deathDate: dateWhere } : undefined,
      select: {
        id: true,
        deathDate: true,
        count: true,
        kindlingDate: true,
        doe: { select: { id: true, tagId: true, retiredTagId: true } },
      },
      orderBy: { deathDate: "desc" },
    }),
    prisma.kitStockMovement.findMany({
      where: { type: "death", ...(dateWhere ? { date: dateWhere } : {}) },
      select: { id: true, date: true, count: true },
      orderBy: { date: "desc" },
    }),
  ]);

  return [
    ...nursing.map((r) => ({
      id: r.id,
      date: r.deathDate,
      stage: "nursing" as const,
      count: r.count,
      doeId: r.doe.id,
      // A doe that has since died had her tag retired so the number could be
      // reused — show the number she carried when the kits were hers.
      doeTag: r.doe.tagId ?? r.doe.retiredTagId,
      kindlingDate: r.kindlingDate,
    })),
    ...weaned.map((r) => ({
      id: r.id,
      date: r.date,
      stage: "weaned" as const,
      count: r.count,
      doeId: null,
      doeTag: null,
      kindlingDate: null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
}
