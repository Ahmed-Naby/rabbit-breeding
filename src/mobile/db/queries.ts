/**
 * Local-SQLite equivalents of the does board's Prisma selects
 * (src/app/does/page.tsx) — feeds the same shared src/lib/does-board.ts
 * row-derivation logic the web Server Component uses, so the two boards can
 * never drift in behavior, only in how the rows are fetched.
 */
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { queryAll, queryOne } from "./helpers";
import type { LocalSettings } from "./types";
import type { DoeBoardBreeding } from "@/lib/does-board";

export type DoeRow = {
  id: string;
  tagId: string | null;
  breed: string | null;
  doeState: string;
  /** Most-recent-first, at most 2 — see does-board.ts's file header for why 2. */
  breedings: DoeBoardBreeding[];
};

const DEFAULT_SETTINGS: LocalSettings = {
  id: 1,
  weightUnit: "kg",
  gestationDays: 31,
  gestationWindowDays: 3,
  pregnancyTestDays: 10,
  weaningDays: 28,
  nestBoxDays: 27,
  matingWeightGrams: 3000,
  rebreedAfterKindlingDays: 0,
  currency: "USD",
};

function toDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export async function getLocalSettings(db: SQLiteDBConnection): Promise<LocalSettings> {
  const row = await queryOne<LocalSettings>(db, "SELECT * FROM settings_cache WHERE id = 1");
  return row ?? DEFAULT_SETTINGS;
}

export async function fetchDoesBoard(db: SQLiteDBConnection): Promise<{ does: DoeRow[]; settings: LocalSettings }> {
  const [settings, doeRows] = await Promise.all([
    getLocalSettings(db),
    queryAll<{ id: string; tagId: string | null; breed: string | null; doeState: string }>(
      db,
      "SELECT id, tagId, breed, doeState FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status != 'deceased' ORDER BY tagId ASC"
    ),
  ]);

  const does: DoeRow[] = [];
  for (const doe of doeRows) {
    const breedingRows = await queryAll<{
      id: string;
      matingDate: string | null;
      actualKindlingDate: string | null;
      buckId: string | null;
    }>(
      db,
      "SELECT id, matingDate, actualKindlingDate, buckId FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 2",
      [doe.id]
    );

    const breedings: DoeBoardBreeding[] = [];
    for (const b of breedingRows) {
      const buck = b.buckId
        ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [b.buckId])
        : null;
      const litter = await queryOne<{
        bornAlive: number;
        bornDead: number;
        weaned: number | null;
        weaningDate: string | null;
      }>(db, "SELECT bornAlive, bornDead, weaned, weaningDate FROM litter WHERE breedingId = ?", [b.id]);

      breedings.push({
        id: b.id,
        matingDate: toDate(b.matingDate),
        actualKindlingDate: toDate(b.actualKindlingDate),
        buckTagId: buck?.tagId ?? null,
        litter: litter
          ? {
              bornAlive: litter.bornAlive,
              bornDead: litter.bornDead,
              weaned: litter.weaned,
              weaningDate: toDate(litter.weaningDate),
            }
          : null,
      });
    }

    does.push({ id: doe.id, tagId: doe.tagId, breed: doe.breed, doeState: doe.doeState, breedings });
  }

  return { does, settings };
}

export async function buckExistsLocally(db: SQLiteDBConnection, tagId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(db, "SELECT id FROM rabbit WHERE sex = 'buck' AND tagId = ?", [tagId]);
  return !!row;
}
