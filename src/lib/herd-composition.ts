import "server-only";
import { prisma } from "./prisma";
import { getKitStockSummary } from "@/app/weaning-sales/stock";
import type { HerdComposition } from "./feed-plan";

/**
 * The herd counted by what each animal is DOING today, which is what feed
 * rations are keyed on (see feed-plan.ts).
 *
 * Two mappings are worth stating, because both are choices:
 *
 *  - A doe who is nursing AND pregnant eats as a nursing doe, not as a
 *    pregnant one. She is carrying the higher of the two loads, and rounding a
 *    doubled-up doe down to the cheaper ration would understate the bill on
 *    exactly the farms working hardest.
 *  - `bred` counts as empty. She has been presented to a buck and nothing is
 *    confirmed; feeding her as pregnant would charge the farm for every failed
 *    service.
 *
 * doeState lives on Rabbit, not Breeding, so the count needs no join and a doe
 * with no breeding row yet is still counted (as empty, which is what she is).
 *
 * Growers are رصيد الفطام — the weaned-kit ledger balance, not a table of
 * rabbits, because weaned kits are never given individual rows. Kits still
 * under a doe are deliberately NOT counted: the nursing ration already covers
 * the litter, so counting them here would pay for the same kit twice.
 */
export async function getHerdComposition(): Promise<HerdComposition> {
  const [doeStates, bucks, juveniles, stock] = await Promise.all([
    prisma.rabbit.groupBy({
      by: ["doeState"],
      where: { sex: "doe", status: "active", tagId: { not: null } },
      _count: { _all: true },
    }),
    prisma.rabbit.count({
      where: { sex: "buck", status: "active", tagId: { not: null } },
    }),
    // سلالة — sexed but not yet promoted to a tag number, so still growing on
    // a replacement ration rather than a fattening one.
    prisma.rabbit.count({ where: { status: "active", tagId: null } }),
    getKitStockSummary(),
  ]);

  const byState = new Map(doeStates.map((r) => [r.doeState, r._count._all]));
  const n = (...states: string[]) =>
    states.reduce((s, st) => s + (byState.get(st) ?? 0), 0);

  const doesNursing = n("nursing", "nursing_bred", "nursing_pregnant");
  const doesPregnant = n("pregnant");
  // Every other state, including «excluded» — a doe waiting to be culled is
  // still in her cage eating today, and the report she feeds into is about
  // this month's bill, not next month's herd.
  const doesIdle = Math.max(
    0,
    doeStates.reduce((s, r) => s + r._count._all, 0) - doesNursing - doesPregnant
  );

  return {
    doesIdle,
    doesPregnant,
    doesNursing,
    bucks,
    growers: Math.max(0, stock.availableStock),
    juveniles,
  };
}
