import "server-only";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";

export type DailyMatingRow = {
  id: string;
  doeId: string;
  doeTag: string | null;
  doeBreed: string | null;
  buckId: string | null;
  buckTag: string | null;
};

export type DailyPregnancyTestRow = {
  id: string;
  doeId: string;
  doeTag: string | null;
  doeBreed: string | null;
  buckId: string | null;
  buckTag: string | null;
  result: string;
};

export type DailyNestBoxRow = {
  id: string;
  doeId: string;
  doeTag: string | null;
  doeBreed: string | null;
};

export type DailyKindlingRow = {
  id: string;
  doeId: string;
  doeTag: string | null;
  doeBreed: string | null;
  buckId: string | null;
  buckTag: string | null;
  bornAlive: number;
  bornDead: number;
};

export type DailyWeaningRow = {
  id: string;
  doeId: string;
  doeTag: string | null;
  doeBreed: string | null;
  weaned: number | null;
  weaningWeightGrams: number | null;
};

export type DailyMortalityRow = {
  id: string;
  sex: string;
  tag: string | null;
  breed: string | null;
  status: string;
};

export type DailyLog = {
  day: Date;
  matings: DailyMatingRow[];
  pregnancyTests: DailyPregnancyTestRow[];
  nestBoxes: DailyNestBoxRow[];
  kindlings: DailyKindlingRow[];
  weanings: DailyWeaningRow[];
  mortality: DailyMortalityRow[];
};

/**
 * Row-level "what happened today" log across every recordable farm event.
 * `day` is UTC midnight for the selected date; the range's exclusive upper
 * bound covers the full 24h window. matingDate/nestBoxDate/Litter.kindlingDate/
 * weaningDate are always stamped at UTC midnight (see breeding-ops.ts), while
 * PregnancyTestLog.testDate and Rabbit.updatedAt are real timestamps — a
 * [day, day+1) range correctly captures both.
 */
export async function getDailyLog(day: Date): Promise<DailyLog> {
  const dayEnd = addDays(day, 1);
  const range = { gte: day, lt: dayEnd };

  const [matings, pregnancyTests, nestBoxes, kindlingLitters, weaningLitters, mortality] =
    await Promise.all([
      prisma.breeding.findMany({
        where: { matingDate: range },
        select: {
          id: true,
          doe: { select: { id: true, tagId: true, breed: true } },
          buck: { select: { id: true, tagId: true } },
        },
        orderBy: { matingDate: "desc" },
      }),
      prisma.pregnancyTestLog.findMany({
        where: { testDate: range },
        select: {
          id: true,
          result: true,
          doe: { select: { id: true, tagId: true, breed: true } },
          buck: { select: { id: true, tagId: true } },
        },
        orderBy: { testDate: "desc" },
      }),
      prisma.breeding.findMany({
        where: { nestBoxDate: range },
        select: {
          id: true,
          doe: { select: { id: true, tagId: true, breed: true } },
        },
        orderBy: { nestBoxDate: "desc" },
      }),
      prisma.litter.findMany({
        where: { kindlingDate: range },
        select: {
          id: true,
          bornAlive: true,
          bornDead: true,
          breeding: {
            select: {
              doe: { select: { id: true, tagId: true, breed: true } },
              buck: { select: { id: true, tagId: true } },
            },
          },
        },
        orderBy: { kindlingDate: "desc" },
      }),
      prisma.litter.findMany({
        where: { weaningDate: range },
        select: {
          id: true,
          weaned: true,
          weaningWeightGrams: true,
          breeding: {
            select: { doe: { select: { id: true, tagId: true, breed: true } } },
          },
        },
        orderBy: { weaningDate: "desc" },
      }),
      prisma.rabbit.findMany({
        where: { status: { in: ["deceased", "culled"] }, updatedAt: range },
        select: {
          id: true,
          sex: true,
          tagId: true,
          retiredTagId: true,
          breed: true,
          status: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  return {
    day,
    matings: matings.map((b) => ({
      id: b.id,
      doeId: b.doe.id,
      doeTag: b.doe.tagId,
      doeBreed: b.doe.breed,
      buckId: b.buck?.id ?? null,
      buckTag: b.buck?.tagId ?? null,
    })),
    pregnancyTests: pregnancyTests.map((p) => ({
      id: p.id,
      doeId: p.doe.id,
      doeTag: p.doe.tagId,
      doeBreed: p.doe.breed,
      buckId: p.buck?.id ?? null,
      buckTag: p.buck?.tagId ?? null,
      result: p.result,
    })),
    nestBoxes: nestBoxes.map((n) => ({
      id: n.id,
      doeId: n.doe.id,
      doeTag: n.doe.tagId,
      doeBreed: n.doe.breed,
    })),
    kindlings: kindlingLitters.map((l) => ({
      id: l.id,
      doeId: l.breeding.doe.id,
      doeTag: l.breeding.doe.tagId,
      doeBreed: l.breeding.doe.breed,
      buckId: l.breeding.buck?.id ?? null,
      buckTag: l.breeding.buck?.tagId ?? null,
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
    })),
    weanings: weaningLitters.map((l) => ({
      id: l.id,
      doeId: l.breeding.doe.id,
      doeTag: l.breeding.doe.tagId,
      doeBreed: l.breeding.doe.breed,
      weaned: l.weaned,
      weaningWeightGrams: l.weaningWeightGrams,
    })),
    mortality: mortality.map((r) => ({
      id: r.id,
      sex: r.sex,
      tag: r.retiredTagId ?? r.tagId,
      breed: r.breed,
      status: r.status,
    })),
  };
}
