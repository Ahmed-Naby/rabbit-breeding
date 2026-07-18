/**
 * Local-SQLite equivalents of the does board's Prisma selects
 * (src/app/does/page.tsx) — feeds the same shared src/lib/does-board.ts
 * row-derivation logic the web Server Component uses, so the two boards can
 * never drift in behavior, only in how the rows are fetched.
 */
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { queryAll, queryOne } from "./helpers";
import type { LocalSettings, LocalRabbit } from "./types";
import type { DoeBoardBreeding } from "@/lib/does-board";
import { weaningDueDate, nestBoxDueDate } from "@/lib/dates";
import {
  resolveNursingLitterRow,
  isWeaningCandidate,
  isNestBoxCandidate,
  isPregnancyTestCandidate,
  isKindlingCandidate,
  isNursingKitDeathCandidate,
  type BaseBreeding
} from "@/lib/breeding-filters";

export type DoeRow = {
  id: string;
  tagId: string | null;
  breed: string | null;
  doeState: string;
  status: string;
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
    queryAll<{ id: string; tagId: string | null; breed: string | null; doeState: string; status: string }>(
      db,
      "SELECT id, tagId, breed, doeState, status FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') ORDER BY tagId ASC"
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

    does.push({ id: doe.id, tagId: doe.tagId, breed: doe.breed, doeState: doe.doeState, status: doe.status, breedings });
  }

  return { does, settings };
}

export async function buckExistsLocally(db: SQLiteDBConnection, tagId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(db, "SELECT id FROM rabbit WHERE sex = 'buck' AND tagId = ?", [tagId]);
  return !!row;
}

export type DashboardStats = {
  totalRabbits: number;
  activeDoes: number;
  activeBucks: number;
  totalLitters: number;
  activeBreedings: number;
};

export async function fetchDashboardStats(db: SQLiteDBConnection): Promise<DashboardStats> {
  const [totalRabbits, activeDoes, activeBucks, totalLitters, activeBreedings] = await Promise.all([
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE status NOT IN ('deceased', 'culled')"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled')"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled')"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM litter"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM breeding WHERE matingDate IS NOT NULL AND actualKindlingDate IS NULL"),
  ]);

  return {
    totalRabbits: totalRabbits?.count ?? 0,
    activeDoes: activeDoes?.count ?? 0,
    activeBucks: activeBucks?.count ?? 0,
    totalLitters: totalLitters?.count ?? 0,
    activeBreedings: activeBreedings?.count ?? 0,
  };
}

export type MatingLogEntry = {
  id: string;
  matingDate: string;
  doeTagId: string | null;
  doeBreed: string | null;
  doeState: string;
  buckTagId: string | null;
};

export async function fetchMatingPageData(db: SQLiteDBConnection): Promise<{
  does: DoeRow[];
  matingLog: MatingLogEntry[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const doesRaw = await queryAll<{
    id: string;
    tagId: string | null;
    breed: string | null;
    doeState: string;
    status: string;
  }>(
    db,
    "SELECT id, tagId, breed, doeState, status FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled', 'resting') AND doeState IN ('empty', 'nursing', 'excluded') ORDER BY tagId ASC"
  );

  const does: DoeRow[] = [];
  for (const doe of doesRaw) {
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

    does.push({ id: doe.id, tagId: doe.tagId, breed: doe.breed, doeState: doe.doeState, status: doe.status, breedings });
  }

  const logRows = await queryAll<{
    id: string;
    matingDate: string;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    "SELECT id, matingDate, doeId, buckId FROM breeding WHERE matingDate IS NOT NULL ORDER BY matingDate DESC LIMIT 100"
  );

  const matingLog: MatingLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null; doeState: string }>(
      db,
      "SELECT tagId, breed, doeState FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    matingLog.push({
      id: row.id,
      matingDate: row.matingDate,
      doeTagId: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      doeState: doe?.doeState ?? "empty",
      buckTagId: buck?.tagId ?? null,
    });
  }

  return { does, matingLog, settings };
}

export type PregnancyTestLogEntry = {
  id: string;
  matingDate: string | null;
  testDate: string;
  result: string;
  doeTagId: string | null;
  doeBreed: string | null;
  buckTagId: string | null;
};

export async function fetchPregnancyPageData(db: SQLiteDBConnection): Promise<{
  candidates: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; buckTagId: string | null; breedingId: string }[];
  testLog: PregnancyTestLogEntry[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const candidatesRaw = await queryAll<{
    id: string;
    tagId: string | null;
    breed: string | null;
    doeState: string;
    breedingId: string;
    matingDate: string | null;
    buckId: string | null;
  }>(
    db,
    `SELECT r.id, r.tagId, r.breed, r.doeState, b.id as breedingId, b.matingDate, b.buckId 
     FROM rabbit r
     JOIN breeding b ON r.id = b.doeId
     WHERE r.sex = 'doe' AND r.tagId IS NOT NULL AND r.status NOT IN ('deceased', 'culled') 
       AND r.doeState IN ('bred', 'nursing_bred')
     ORDER BY r.tagId ASC`
  );

  const candidates: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; buckTagId: string | null; breedingId: string }[] = [];
  const today = new Date();
  for (const c of candidatesRaw) {
    if (!isPregnancyTestCandidate({ id: c.breedingId, matingDate: c.matingDate, actualKindlingDate: null }, settings.pregnancyTestDays, today)) continue;
    const buck = c.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [c.buckId])
      : null;
    candidates.push({
      id: c.id,
      tagId: c.tagId,
      breed: c.breed,
      doeState: c.doeState,
      matingDate: c.matingDate,
      buckTagId: buck?.tagId ?? null,
      breedingId: c.breedingId,
    });
  }

  // Get test log entries straight off pregnancy_test_log table
  const logRows = await queryAll<{
    id: string;
    matingDate: string;
    testDate: string;
    result: string;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    "SELECT id, matingDate, testDate, result, doeId, buckId FROM pregnancy_test_log ORDER BY testDate DESC LIMIT 100"
  );

  const testLog: PregnancyTestLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    testLog.push({
      id: row.id,
      matingDate: row.matingDate,
      testDate: row.testDate,
      result: row.result,
      doeTagId: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckTagId: buck?.tagId ?? null,
    });
  }

  return { candidates, testLog, settings };
}

export type LocalNestBoxCandidate = {
  id: string;
  tagId: string | null;
  breed: string | null;
  doeState: string;
  matingDate: string | null;
  expectedKindlingDate: string;
  buckTagId: string | null;
  breedingId: string;
  expectedInstallDate: string;
};

export type LocalInstalledNestBoxLogEntry = {
  id: string;
  doeId: string;
  doeTagId: string | null;
  doeBreed: string | null;
  doeState: string;
  buckTagId: string | null;
  matingDate: string | null;
  nestBoxDate: string;
};

export async function fetchNestBoxPageData(db: SQLiteDBConnection): Promise<{
  does: LocalNestBoxCandidate[];
  installedLog: LocalInstalledNestBoxLogEntry[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);

  // Get active doe candidates
  const candidates = await queryAll<{
    id: string;
    tagId: string;
    breed: string | null;
    doeState: string;
  }>(
    db,
    `SELECT id, tagId, breed, doeState 
     FROM rabbit 
     WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') 
       AND doeState IN ('bred', 'pregnant', 'nursing_bred', 'nursing_pregnant') 
     ORDER BY tagId ASC`
  );

  const does: LocalNestBoxCandidate[] = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Include full day

  for (const doe of candidates) {
    // Get latest breeding
    const b = await queryOne<{
      id: string;
      matingDate: string | null;
      nestBoxDate: string | null;
      expectedKindlingDate: string;
      buckId: string | null;
    }>(
      db,
      "SELECT id, matingDate, nestBoxDate, expectedKindlingDate, buckId FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 1",
      [doe.id]
    );

    if (!b || !isNestBoxCandidate({ id: b.id, matingDate: b.matingDate, nestBoxDate: b.nestBoxDate, actualKindlingDate: null }, settings.nestBoxDays, today)) continue;

    const dueDate = nestBoxDueDate(new Date(b.matingDate!), settings.nestBoxDays);

    const buck = b.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [b.buckId])
      : null;

    does.push({
      id: doe.id,
      tagId: doe.tagId,
      breed: doe.breed,
      doeState: doe.doeState,
      matingDate: b.matingDate,
      expectedKindlingDate: b.expectedKindlingDate,
      buckTagId: buck?.tagId ?? null,
      breedingId: b.id,
      expectedInstallDate: dueDate.toISOString(),
    });
  }

  // Get installed logs straight off current Breeding rows (nestBoxDate is not null)
  const logRows = await queryAll<{
    id: string;
    matingDate: string | null;
    nestBoxDate: string;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    `SELECT id, matingDate, nestBoxDate, doeId, buckId 
     FROM breeding 
     WHERE nestBoxDate IS NOT NULL 
     ORDER BY nestBoxDate DESC LIMIT 100`
  );

  const installedLog: LocalInstalledNestBoxLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null; doeState: string }>(
      db,
      "SELECT tagId, breed, doeState FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;

    installedLog.push({
      id: row.id,
      doeId: row.doeId,
      doeTagId: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      doeState: doe?.doeState ?? "empty",
      buckTagId: buck?.tagId ?? null,
      matingDate: row.matingDate,
      nestBoxDate: row.nestBoxDate,
    });
  }

  return { does, installedLog, settings };
}

export type KindlingLogEntry = {
  id: string;
  breedingId: string;
  kindlingDate: string;
  matingDate: string | null;
  bornAlive: number;
  bornDead: number;
  doeId: string;
  doeTagId: string | null;
  doeBreed: string | null;
  buckTagId: string | null;
};

export async function fetchKindlingPageData(db: SQLiteDBConnection): Promise<{
  does: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; expectedKindlingDate: string; buckTagId: string | null; breedingId: string }[];
  kindlingLog: KindlingLogEntry[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);

  // 1. Fetch candidates (active pregnant does)
  const candidates = await queryAll<{
    id: string;
    tagId: string;
    breed: string | null;
    doeState: string;
  }>(
    db,
    `SELECT id, tagId, breed, doeState 
     FROM rabbit 
     WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') 
       AND doeState IN ('pregnant', 'nursing_pregnant') 
     ORDER BY tagId ASC`
  );

  const does: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; expectedKindlingDate: string; buckTagId: string | null; breedingId: string }[] = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Include full day

  for (const doe of candidates) {
    // Get latest breeding
    const b = await queryOne<{
      id: string;
      matingDate: string | null;
      expectedKindlingDate: string;
      buckId: string | null;
    }>(
      db,
      "SELECT id, matingDate, expectedKindlingDate, buckId FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 1",
      [doe.id]
    );

    if (!b || !isKindlingCandidate({ id: b.id, matingDate: b.matingDate, actualKindlingDate: null }, settings.gestationDays, today)) continue;

    const buck = b.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [b.buckId])
      : null;

    does.push({
      id: doe.id,
      tagId: doe.tagId,
      breed: doe.breed,
      doeState: doe.doeState,
      matingDate: b.matingDate,
      expectedKindlingDate: b.expectedKindlingDate,
      buckTagId: buck?.tagId ?? null,
      breedingId: b.id,
    });
  }

  // 2. Fetch kindling log from local kindling_log table
  const logRows = await queryAll<{
    id: string;
    matingDate: string | null;
    kindlingDate: string;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    "SELECT id, matingDate, kindlingDate, doeId, buckId FROM kindling_log ORDER BY kindlingDate DESC LIMIT 100"
  );

  const kindlingLog: KindlingLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;

    // Resolve breedingId from the breeding table itself (matched by doe + kindlingDate day),
    // not via litter — litter rows are only created lazily once a count is first entered
    // (see local-ops.ts), so a doe just marked as kindled has no litter row yet and an
    // inner join through litter would leave breedingId unresolvable forever.
    let bornAlive = 0;
    let bornDead = 0;
    let breedingId = "";
    if (row.kindlingDate) {
      const dateStr = row.kindlingDate.slice(0, 10);
      const matchingBreeding = await queryOne<{ id: string; bornAlive: number | null; bornDead: number | null }>(
        db,
        `SELECT b.id, l.bornAlive, l.bornDead
         FROM breeding b
         LEFT JOIN litter l ON l.breedingId = b.id
         WHERE b.doeId = ? AND substr(b.actualKindlingDate, 1, 10) = ?`,
        [row.doeId, dateStr]
      );
      if (matchingBreeding) {
        bornAlive = matchingBreeding.bornAlive ?? 0;
        bornDead = matchingBreeding.bornDead ?? 0;
        breedingId = matchingBreeding.id;
      }
    }

    kindlingLog.push({
      id: row.id,
      breedingId,
      kindlingDate: row.kindlingDate,
      matingDate: row.matingDate,
      bornAlive,
      bornDead,
      doeId: row.doeId,
      doeTagId: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckTagId: buck?.tagId ?? null,
    });
  }

  return { does, kindlingLog, settings };
}

export type WeaningLitterRow = {
  id: string;
  breedingId: string;
  kindlingDate: string;
  bornAlive: number;
  bornDead: number;
  doeId: string;
  doeTagId: string | null;
  doeBreed: string | null;
  doeState: string;
  buckTagId: string | null;
};

export type WeanedLitterLogEntry = {
  breedingId: string;
  kindlingDate: string;
  weaningDate: string;
  bornAlive: number;
  bornDead: number;
  weaned: number | null;
  weaningWeightGrams: number | null;
  doeTagId: string | null;
  doeBreed: string | null;
  buckTagId: string | null;
};

export async function fetchWeaningPageData(db: SQLiteDBConnection): Promise<{
  litters: WeaningLitterRow[];
  weanedLog: WeanedLitterLogEntry[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);

  // 1. Fetch candidates (active nursing does)
  const candidates = await queryAll<{
    id: string;
    tagId: string;
    breed: string | null;
    doeState: string;
  }>(
    db,
    `SELECT id, tagId, breed, doeState 
     FROM rabbit 
     WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') 
       AND doeState IN ('nursing', 'nursing_bred', 'nursing_pregnant') 
     ORDER BY tagId ASC`
  );

  const litters: WeaningLitterRow[] = [];
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Include full day

  for (const doe of candidates) {
    // Fetch latest 2 breedings for this doe
    const breedings = await queryAll<{
      id: string;
      actualKindlingDate: string | null;
      buckId: string | null;
    }>(
      db,
      "SELECT id, actualKindlingDate, buckId FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 2",
      [doe.id]
    );

    if (breedings.length === 0) continue;

    const mappedBreedings: BaseBreeding[] = [];
    for (const br of breedings) {
      const lit = await queryOne<{ bornAlive: number; bornDead: number; weaningDate: string | null }>(
        db,
        "SELECT bornAlive, bornDead, weaningDate FROM litter WHERE breedingId = ?",
        [br.id]
      );
      mappedBreedings.push({
        id: br.id,
        matingDate: null,
        actualKindlingDate: br.actualKindlingDate,
        litter: lit ? { bornAlive: lit.bornAlive, bornDead: lit.bornDead, weaningDate: lit.weaningDate } : null
      });
    }

    const resolved = resolveNursingLitterRow(mappedBreedings);
    if (!resolved || !isWeaningCandidate(resolved, settings.weaningDays, today)) continue;

    const originalBreeding = breedings.find(x => x.id === resolved.id)!;
    const litRow = await queryOne<{ id: string }>(
      db,
      "SELECT id FROM litter WHERE breedingId = ?",
      [resolved.id]
    );

    const buck = originalBreeding.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [originalBreeding.buckId])
      : null;

    litters.push({
      id: litRow?.id ?? "",
      breedingId: originalBreeding.id,
      kindlingDate: originalBreeding.actualKindlingDate!,
      bornAlive: resolved.litter!.bornAlive,
      bornDead: resolved.litter!.bornDead,
      doeId: doe.id,
      doeTagId: doe.tagId,
      doeBreed: doe.breed,
      doeState: doe.doeState,
      buckTagId: buck?.tagId ?? null,
    });
  }

  // 2. Get weaned log entries derived from litter table
  const logRows = await queryAll<{
    breedingId: string;
    kindlingDate: string;
    weaningDate: string;
    bornAlive: number;
    bornDead: number;
    weaned: number | null;
    weaningWeightGrams: number | null;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    `SELECT l.breedingId, l.kindlingDate, l.weaningDate, l.bornAlive, l.bornDead, l.weaned, l.weaningWeightGrams, b.doeId, b.buckId
     FROM litter l
     JOIN breeding b ON l.breedingId = b.id
     WHERE l.weaningDate IS NOT NULL
     ORDER BY l.weaningDate DESC LIMIT 100`
  );

  const weanedLog: WeanedLitterLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    weanedLog.push({
      breedingId: row.breedingId,
      kindlingDate: row.kindlingDate,
      weaningDate: row.weaningDate,
      bornAlive: row.bornAlive,
      bornDead: row.bornDead,
      weaned: row.weaned,
      weaningWeightGrams: row.weaningWeightGrams,
      doeTagId: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckTagId: buck?.tagId ?? null,
    });
  }

  return { litters, weanedLog, settings };
}

export async function fetchRabbitsRoster(
  db: SQLiteDBConnection,
  sexFilter?: "doe" | "buck" | "all"
): Promise<LocalRabbit[]> {
  let query = "SELECT * FROM rabbit WHERE status NOT IN ('deceased', 'culled')";
  const params: unknown[] = [];
  if (sexFilter === "doe") {
    query += " AND sex = 'doe' AND tagId IS NOT NULL";
  } else if (sexFilter === "buck") {
    query += " AND sex = 'buck' AND tagId IS NOT NULL";
  }
  query += " ORDER BY tagId ASC, id ASC";
  return queryAll<LocalRabbit>(db, query, params);
}

export type LocalRabbitSearchResult = {
  id: string;
  tagId: string | null;
  breed: string | null;
  cage: string | null;
  sex: string;
};

/** Header search box (offline): find a rabbit by tag number, cage, or breed. */
export async function searchRabbits(db: SQLiteDBConnection, query: string): Promise<LocalRabbitSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  // Deceased/culled rabbits are already excluded here (status NOT IN
  // ('deceased', 'culled')), so there's no retiredTagId to search —
  // unlike the web header search.
  return queryAll<LocalRabbitSearchResult>(
    db,
    `SELECT id, tagId, breed, cage, sex FROM rabbit
     WHERE status NOT IN ('deceased', 'culled') AND (tagId LIKE ? OR cage LIKE ? OR breed LIKE ?)
     ORDER BY tagId ASC
     LIMIT 8`,
    [like, like, like]
  );
}

export type LocalFosterLogEntry = {
  id: string;
  fromDoeId: string;
  fromDoeTag: string | null;
  toDoeId: string;
  toDoeTag: string | null;
  count: number;
  date: string;
};

export async function fetchFosteringPageData(db: SQLiteDBConnection): Promise<{
  logs: LocalFosterLogEntry[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const rows = await queryAll<{
    id: string;
    fromDoeId: string;
    toDoeId: string;
    count: number;
    date: string;
  }>(db, "SELECT id, fromDoeId, toDoeId, count, date FROM foster_log ORDER BY date DESC, createdAt DESC LIMIT 100");

  const logs: LocalFosterLogEntry[] = [];
  for (const row of rows) {
    const fromDoe = await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.fromDoeId]);
    const toDoe = await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.toDoeId]);
    logs.push({
      id: row.id,
      fromDoeId: row.fromDoeId,
      fromDoeTag: fromDoe?.tagId ?? null,
      toDoeId: row.toDoeId,
      toDoeTag: toDoe?.tagId ?? null,
      count: row.count,
      date: row.date,
    });
  }

  return { logs, settings };
}

export type LocalKitLedgerEntry = {
  key: string;
  date: string;
  kind: "wean" | "sale" | "death" | "retained" | "adjustment";
  count: number;
  weightGrams?: number | null;
  pricePerKgCents?: number | null;
  amountCents?: number | null;
  notes?: string | null;
  id?: string;
};

export async function fetchWeaningSalesPageData(db: SQLiteDBConnection): Promise<{
  ledger: LocalKitLedgerEntry[];
  totalWeaned: number;
  totalSold: number;
  totalDied: number;
  totalRetained: number;
  totalRevenueCents: number;
  availableStock: number;
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);

  const weanedLitters = await queryAll<{ weaningDate: string; weaned: number }>(
    db,
    "SELECT weaningDate, weaned FROM litter WHERE weaningDate IS NOT NULL AND weaned IS NOT NULL"
  );

  const movements = await queryAll<{
    id: string;
    date: string;
    type: string;
    count: number;
    weightGrams: number | null;
    pricePerKgCents: number | null;
    amountCents: number | null;
    notes: string | null;
  }>(db, "SELECT id, date, type, count, weightGrams, pricePerKgCents, amountCents, notes FROM kit_stock_movement ORDER BY date DESC, createdAt DESC");

  const weanedByDay = new Map<string, { date: string; count: number }>();
  for (const l of weanedLitters) {
    const key = l.weaningDate.slice(0, 10);
    const existing = weanedByDay.get(key);
    if (existing) existing.count += l.weaned;
    else weanedByDay.set(key, { date: l.weaningDate, count: l.weaned });
  }

  const ledger: LocalKitLedgerEntry[] = [
    ...Array.from(weanedByDay.entries()).map(([key, v]) => ({
      key: `wean-${key}`,
      date: v.date,
      kind: "wean" as const,
      count: v.count,
    })),
    ...movements.map((m) => ({
      key: `move-${m.id}`,
      date: m.date,
      kind: m.type as "sale" | "death" | "retained" | "adjustment",
      // Sale/death/retained withdraw from the pool (shown negative); an
      // adjustment carries its own sign and is shown as stored.
      count: m.type === "adjustment" ? m.count : -m.count,
      weightGrams: m.weightGrams,
      pricePerKgCents: m.pricePerKgCents,
      amountCents: m.amountCents,
      notes: m.notes,
      id: m.id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
  const availableStock = totalWeaned - totalSold - totalDied - totalRetained + totalAdjustment;

  return {
    ledger,
    totalWeaned,
    totalSold,
    totalDied,
    totalRetained,
    totalRevenueCents,
    availableStock,
    settings,
  };
}

export type LocalDeceasedRabbit = {
  id: string;
  tagId: string | null;
  retiredTagId: string | null;
  breed: string | null;
  sex: string;
  updatedAt: string;
};

export async function fetchMortalityPageData(db: SQLiteDBConnection): Promise<{
  activeMothers: LocalRabbit[];
  activeBucks: LocalRabbit[];
  activeStock: LocalRabbit[];
  deceasedRabbits: LocalDeceasedRabbit[];
  culledRabbits: LocalDeceasedRabbit[];
  nursingDoes: { doe: { id: string; tagId: string; breed: string }; breedingId: string; litter: { bornAlive: number; bornDead: number } }[];
  availableWeanedStock: number;
}> {
  // 1. Active mothers (does with tagId)
  const activeMothers = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status NOT IN ('deceased', 'culled') AND sex = 'doe' AND tagId IS NOT NULL ORDER BY tagId ASC, id ASC"
  );

  // 2. Active bucks (bucks with tagId)
  const activeBucks = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status NOT IN ('deceased', 'culled') AND sex = 'buck' AND tagId IS NOT NULL ORDER BY tagId ASC, id ASC"
  );

  // 3. Active stock (rabbits without tagId)
  const activeStock = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status NOT IN ('deceased', 'culled') AND tagId IS NULL ORDER BY id ASC"
  );

  // 4. Deceased rabbits log
  const deceasedRabbits = await queryAll<LocalDeceasedRabbit>(
    db,
    "SELECT id, tagId, retiredTagId, breed, sex, updatedAt FROM rabbit WHERE status = 'deceased' ORDER BY updatedAt DESC LIMIT 100"
  );

  // 4b. Culled rabbits log (استبعاد)
  const culledRabbits = await queryAll<LocalDeceasedRabbit>(
    db,
    "SELECT id, tagId, retiredTagId, breed, sex, updatedAt FROM rabbit WHERE status = 'culled' ORDER BY updatedAt DESC LIMIT 100"
  );

  // 5. Nursing does
  const does = await queryAll<{ id: string; tagId: string; breed: string }>(
    db,
    "SELECT id, tagId, breed FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') ORDER BY tagId ASC"
  );
  const nursingDoes: { doe: { id: string; tagId: string; breed: string }; breedingId: string; litter: { bornAlive: number; bornDead: number } }[] = [];
  for (const doe of does) {
    const breedings = await queryAll<{ id: string; actualKindlingDate: string | null }>(
      db,
      "SELECT id, actualKindlingDate FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 2",
      [doe.id]
    );
    if (breedings.length === 0) continue;

    const mappedBreedings: BaseBreeding[] = [];
    for (const br of breedings) {
      const lit = await queryOne<{ bornAlive: number; bornDead: number; weaningDate: string | null }>(
        db,
        "SELECT bornAlive, bornDead, weaningDate FROM litter WHERE breedingId = ?",
        [br.id]
      );
      mappedBreedings.push({
        id: br.id,
        matingDate: null,
        actualKindlingDate: br.actualKindlingDate,
        litter: lit ? { bornAlive: lit.bornAlive, bornDead: lit.bornDead, weaningDate: lit.weaningDate } : null
      });
    }

    const resolved = resolveNursingLitterRow(mappedBreedings);
    if (!resolved || !isNursingKitDeathCandidate(resolved)) continue;

    nursingDoes.push({
      doe: { id: doe.id, tagId: doe.tagId, breed: doe.breed },
      breedingId: resolved.id,
      litter: { bornAlive: resolved.litter!.bornAlive, bornDead: resolved.litter!.bornDead },
    });
  }

  // 6. Available stock
  const weanedLittersSum = await queryOne<{ total: number }>(
    db,
    "SELECT SUM(weaned) as total FROM litter WHERE weaningDate IS NOT NULL AND weaned IS NOT NULL"
  );
  const movementsSum = await queryAll<{ type: string; total: number }>(
    db,
    "SELECT type, SUM(count) as total FROM kit_stock_movement GROUP BY type"
  );
  const totalWeaned = weanedLittersSum?.total ?? 0;
  let sold = 0, died = 0, retained = 0;
  for (const m of movementsSum) {
    if (m.type === "sale") sold = m.total;
    else if (m.type === "death") died = m.total;
    else if (m.type === "retained") retained = m.total;
  }
  const availableWeanedStock = totalWeaned - sold - died - retained;

  return { activeMothers, activeBucks, activeStock, deceasedRabbits, culledRabbits, nursingDoes, availableWeanedStock };
}

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
  matings: DailyMatingRow[];
  pregnancyTests: DailyPregnancyTestRow[];
  nestBoxes: DailyNestBoxRow[];
  kindlings: DailyKindlingRow[];
  weanings: DailyWeaningRow[];
  mortality: DailyMortalityRow[];
};

/** dayIso is a plain "YYYY-MM-DD" string — local dates are stored as ISO TEXT, so a substr(...,1,10) match is a calendar-day filter with no timezone math. */
export async function fetchDailyPageData(db: SQLiteDBConnection, dayIso: string): Promise<DailyLog> {
  const matingRows = await queryAll<{ id: string; doeId: string; buckId: string | null }>(
    db,
    "SELECT id, doeId, buckId FROM breeding WHERE matingDate IS NOT NULL AND substr(matingDate, 1, 10) = ? ORDER BY matingDate DESC",
    [dayIso]
  );
  const matings: DailyMatingRow[] = [];
  for (const row of matingRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    matings.push({
      id: row.id,
      doeId: row.doeId,
      doeTag: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckId: row.buckId,
      buckTag: buck?.tagId ?? null,
    });
  }

  const pregnancyTestRows = await queryAll<{
    id: string;
    doeId: string;
    buckId: string | null;
    result: string;
  }>(
    db,
    "SELECT id, doeId, buckId, result FROM pregnancy_test_log WHERE substr(testDate, 1, 10) = ? ORDER BY testDate DESC",
    [dayIso]
  );
  const pregnancyTests: DailyPregnancyTestRow[] = [];
  for (const row of pregnancyTestRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    pregnancyTests.push({
      id: row.id,
      doeId: row.doeId,
      doeTag: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckId: row.buckId,
      buckTag: buck?.tagId ?? null,
      result: row.result,
    });
  }

  const nestBoxRows = await queryAll<{ id: string; doeId: string }>(
    db,
    "SELECT id, doeId FROM breeding WHERE nestBoxDate IS NOT NULL AND substr(nestBoxDate, 1, 10) = ? ORDER BY nestBoxDate DESC",
    [dayIso]
  );
  const nestBoxes: DailyNestBoxRow[] = [];
  for (const row of nestBoxRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    nestBoxes.push({
      id: row.id,
      doeId: row.doeId,
      doeTag: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
    });
  }

  const kindlingRows = await queryAll<{
    id: string;
    doeId: string;
    buckId: string | null;
    bornAlive: number | null;
    bornDead: number | null;
  }>(
    db,
    `SELECT b.id, b.doeId, b.buckId, l.bornAlive, l.bornDead
     FROM breeding b
     LEFT JOIN litter l ON l.breedingId = b.id
     WHERE b.actualKindlingDate IS NOT NULL AND substr(b.actualKindlingDate, 1, 10) = ?
     ORDER BY b.actualKindlingDate DESC`,
    [dayIso]
  );
  const kindlings: DailyKindlingRow[] = [];
  for (const row of kindlingRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    kindlings.push({
      id: row.id,
      doeId: row.doeId,
      doeTag: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckId: row.buckId,
      buckTag: buck?.tagId ?? null,
      bornAlive: row.bornAlive ?? 0,
      bornDead: row.bornDead ?? 0,
    });
  }

  const weaningRows = await queryAll<{
    id: string;
    doeId: string;
    weaned: number | null;
    weaningWeightGrams: number | null;
  }>(
    db,
    `SELECT l.id, b.doeId, l.weaned, l.weaningWeightGrams
     FROM litter l
     JOIN breeding b ON l.breedingId = b.id
     WHERE l.weaningDate IS NOT NULL AND substr(l.weaningDate, 1, 10) = ?
     ORDER BY l.weaningDate DESC`,
    [dayIso]
  );
  const weanings: DailyWeaningRow[] = [];
  for (const row of weaningRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    weanings.push({
      id: row.id,
      doeId: row.doeId,
      doeTag: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      weaned: row.weaned,
      weaningWeightGrams: row.weaningWeightGrams,
    });
  }

  const mortality = await queryAll<DailyMortalityRow & { retiredTagId: string | null; tagId: string | null }>(
    db,
    `SELECT id, sex, tagId, retiredTagId, breed, status
     FROM rabbit
     WHERE status IN ('deceased', 'culled') AND substr(updatedAt, 1, 10) = ?
     ORDER BY updatedAt DESC`,
    [dayIso]
  );

  return {
    matings,
    pregnancyTests,
    nestBoxes,
    kindlings,
    weanings,
    mortality: mortality.map((r) => ({
      id: r.id,
      sex: r.sex,
      tag: r.retiredTagId ?? r.tagId,
      breed: r.breed,
      status: r.status,
    })),
  };
}

export type LocalHealthRecord = {
  id: string;
  rabbitId: string;
  rabbitTag: string | null;
  date: string;
  type: string;
  description: string;
  nextDueDate: string | null;
};

export async function fetchHealthPageData(db: SQLiteDBConnection): Promise<{
  activeRabbits: LocalRabbit[];
  records: LocalHealthRecord[];
}> {
  const activeRabbits = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status NOT IN ('deceased', 'culled') ORDER BY tagId ASC, id ASC"
  );

  const rows = await queryAll<{
    id: string;
    rabbitId: string;
    date: string;
    type: string;
    description: string;
    nextDueDate: string | null;
  }>(db, "SELECT id, rabbitId, date, type, description, nextDueDate FROM health_record ORDER BY date DESC, createdAt DESC LIMIT 200");

  const records: LocalHealthRecord[] = [];
  for (const row of rows) {
    const rabbit = await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.rabbitId]);
    records.push({
      ...row,
      rabbitTag: rabbit?.tagId ?? null,
    });
  }

  return { activeRabbits, records };
}

export type LocalTransaction = {
  id: string;
  date: string;
  type: string;
  category: string;
  amountCents: number;
  notes: string | null;
};

export async function fetchFinancePageData(db: SQLiteDBConnection): Promise<{
  transactions: LocalTransaction[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const transactions = await queryAll<LocalTransaction>(
    db,
    "SELECT id, date, type, category, amountCents, notes FROM transaction_ledger ORDER BY date DESC, createdAt DESC LIMIT 200"
  );
  return { transactions, settings };
}

export type LocalBreed = {
  id: string;
  name: string;
};

export async function fetchSettingsPageData(db: SQLiteDBConnection): Promise<{
  settings: LocalSettings;
  breeds: LocalBreed[];
 }> {
  const settings = await getLocalSettings(db);
  const breeds = await queryAll<LocalBreed>(db, "SELECT id, name FROM breed ORDER BY name ASC");
  return { settings, breeds };
}

// Settings-managed breed list only — matches the web app's getBreedOptions()
// (src/lib/breeds.ts). These dropdowns are all add-new-rabbit breed fields,
// not filters, so legacy free-text rabbit.breed values (old seed data, typos)
// shouldn't appear as selectable choices here.
export async function fetchBreedOptions(db: SQLiteDBConnection): Promise<string[]> {
  const definedBreeds = await queryAll<{ name: string }>(db, "SELECT name FROM breed ORDER BY name ASC");
  return definedBreeds.map(b => b.name);
}

export async function fetchMothersPageData(db: SQLiteDBConnection): Promise<{
  does: { id: string; tagId: string | null; breed: string | null; acquiredDate: string; weightGrams: number | null; status: string; doeState: string }[];
  pendingMothers: { id: string; breed: string | null; cage: string | null; weightKg: number | null }[];
  breedOptions: string[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const breeds = await fetchBreedOptions(db);

  const doesRaw = await queryAll<{
    id: string;
    tagId: string | null;
    breed: string | null;
    acquiredDate: string | null;
    createdAt: string;
    status: string;
    doeState: string;
  }>(
    db,
    "SELECT id, tagId, breed, acquiredDate, createdAt, status, doeState FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') ORDER BY tagId ASC"
  );

  const does = [];
  for (const d of doesRaw) {
    const w = await queryOne<{ weightGrams: number }>(
      db,
      "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC, id DESC LIMIT 1",
      [d.id]
    );
    does.push({
      id: d.id,
      tagId: d.tagId,
      breed: d.breed,
      acquiredDate: d.acquiredDate || d.createdAt,
      weightGrams: w?.weightGrams ?? null,
      status: d.status,
      doeState: d.doeState,
    });
  }

  const pendingRaw = await queryAll<{
    id: string;
    breed: string | null;
    cage: string | null;
  }>(
    db,
    "SELECT id, breed, cage FROM rabbit WHERE sex = 'doe' AND tagId IS NULL AND movedToHerdPen = 1 AND status NOT IN ('deceased', 'culled') ORDER BY createdAt DESC"
  );

  const pendingMothers = [];
  for (const p of pendingRaw) {
    const w = await queryOne<{ weightGrams: number }>(
      db,
      "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC, id DESC LIMIT 1",
      [p.id]
    );
    pendingMothers.push({
      id: p.id,
      breed: p.breed,
      cage: p.cage,
      weightKg: w ? w.weightGrams / 1000 : null,
    });
  }

  return { does, pendingMothers, breedOptions: breeds, settings };
}

export async function fetchBucksPageData(db: SQLiteDBConnection): Promise<{
  bucks: { id: string; tagId: string | null; breed: string | null; acquiredDate: string; weightGrams: number | null; status: string }[];
  pendingBucks: { id: string; breed: string | null; cage: string | null; weightKg: number | null }[];
  breedOptions: string[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const breeds = await fetchBreedOptions(db);

  const bucksRaw = await queryAll<{
    id: string;
    tagId: string | null;
    breed: string | null;
    acquiredDate: string | null;
    createdAt: string;
    status: string;
  }>(
    db,
    "SELECT id, tagId, breed, acquiredDate, createdAt, status FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') ORDER BY tagId ASC"
  );

  const bucks = [];
  for (const b of bucksRaw) {
    const w = await queryOne<{ weightGrams: number }>(
      db,
      "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC, id DESC LIMIT 1",
      [b.id]
    );
    bucks.push({
      id: b.id,
      tagId: b.tagId,
      breed: b.breed,
      acquiredDate: b.acquiredDate || b.createdAt,
      weightGrams: w?.weightGrams ?? null,
      status: b.status,
    });
  }

  const pendingRaw = await queryAll<{
    id: string;
    breed: string | null;
    cage: string | null;
  }>(
    db,
    "SELECT id, breed, cage FROM rabbit WHERE sex = 'buck' AND tagId IS NULL AND movedToHerdPen = 1 AND status NOT IN ('deceased', 'culled') ORDER BY createdAt DESC"
  );

  const pendingBucks = [];
  for (const p of pendingRaw) {
    const w = await queryOne<{ weightGrams: number }>(
      db,
      "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC, id DESC LIMIT 1",
      [p.id]
    );
    pendingBucks.push({
      id: p.id,
      breed: p.breed,
      cage: p.cage,
      weightKg: w ? w.weightGrams / 1000 : null,
    });
  }

  return { bucks, pendingBucks, breedOptions: breeds, settings };
}

export async function fetchStockPageData(db: SQLiteDBConnection): Promise<{
  rabbits: { id: string; sex: string; breed: string | null; cage: string | null; date: string; weightKg: number | null }[];
  breedOptions: string[];
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const breeds = await fetchBreedOptions(db);

  const rabbitsRaw = await queryAll<{
    id: string;
    sex: string;
    breed: string | null;
    cage: string | null;
    acquiredDate: string | null;
    createdAt: string;
  }>(
    db,
    "SELECT id, sex, breed, cage, acquiredDate, createdAt FROM rabbit WHERE tagId IS NULL AND movedToHerdPen = 0 AND status NOT IN ('deceased', 'culled') ORDER BY createdAt DESC"
  );

  const rabbits = [];
  for (const r of rabbitsRaw) {
    const w = await queryOne<{ weightGrams: number }>(
      db,
      "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC, id DESC LIMIT 1",
      [r.id]
    );
    rabbits.push({
      id: r.id,
      sex: r.sex,
      breed: r.breed,
      cage: r.cage,
      date: r.acquiredDate || r.createdAt,
      weightKg: w ? w.weightGrams / 1000 : null,
    });
  }

  return { rabbits, breedOptions: breeds, settings };
}

export type LocalRabbitBasic = {
  id: string;
  tagId: string | null;
  retiredTagId: string | null;
  breed: string | null;
  color: string | null;
  sex: string;
  status: string;
  doeState: string;
  origin: string | null;
  cage: string | null;
  dateOfBirth: string | null;
  acquiredDate: string | null;
  acquiredFrom: string | null;
  notes: string | null;
};

export async function fetchRabbitBasic(db: SQLiteDBConnection, id: string): Promise<LocalRabbitBasic | null> {
  return queryOne<LocalRabbitBasic>(
    db,
    "SELECT id, tagId, retiredTagId, breed, color, sex, status, doeState, origin, cage, dateOfBirth, acquiredDate, acquiredFrom, notes FROM rabbit WHERE id = ?",
    [id]
  );
}

/** yyyy-MM-dd key for matching by calendar day — mirrors src/app/rabbits/[id]/breeding-history.tsx's dayKey. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export type DoeBreedingHistoryRow = {
  matingDate: string;
  buckTagId: string | null;
  testDate: string | null;
  testResult: string | null;
  kindlingDate: string | null;
  bornAlive: number | null;
  bornDead: number | null;
  weaningDate: string | null;
  weaned: number | null;
};

/**
 * Local-SQLite port of BreedingHistoryPanel's stitching algorithm
 * (src/app/rabbits/[id]/breeding-history.tsx) — one row per breeding cycle,
 * anchored on matingDate since Breeding rows themselves get reused/
 * overwritten on the doe's next mating (see markMated in local-ops.ts). Must
 * stay in lockstep with the web version's logic, not just its output shape.
 */
export async function fetchDoeBreedingHistory(db: SQLiteDBConnection, doeId: string): Promise<DoeBreedingHistoryRow[]> {
  const cycles = new Map<string, DoeBreedingHistoryRow>();

  function ensure(matingDate: string, buckTagId: string | null): DoeBreedingHistoryRow {
    let c = cycles.get(matingDate);
    if (!c) {
      c = {
        matingDate,
        buckTagId,
        testDate: null,
        testResult: null,
        kindlingDate: null,
        bornAlive: null,
        bornDead: null,
        weaningDate: null,
        weaned: null,
      };
      cycles.set(matingDate, c);
    } else if (!c.buckTagId && buckTagId) {
      c.buckTagId = buckTagId;
    }
    return c;
  }

  async function buckTag(buckId: string | null): Promise<string | null> {
    if (!buckId) return null;
    const buck = await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [buckId]);
    return buck?.tagId ?? null;
  }

  const ongoing = await queryAll<{ matingDate: string | null; buckId: string | null }>(
    db,
    "SELECT matingDate, buckId FROM breeding WHERE doeId = ? AND matingDate IS NOT NULL",
    [doeId]
  );
  for (const b of ongoing) {
    if (!b.matingDate) continue;
    ensure(b.matingDate, await buckTag(b.buckId));
  }

  const pregnancyTests = await queryAll<{ matingDate: string; testDate: string; result: string; buckId: string | null }>(
    db,
    "SELECT matingDate, testDate, result, buckId FROM pregnancy_test_log WHERE doeId = ?",
    [doeId]
  );
  for (const row of pregnancyTests) {
    const c = ensure(row.matingDate, await buckTag(row.buckId));
    c.testDate = row.testDate;
    c.testResult = row.result;
  }

  const kindlings = await queryAll<{ matingDate: string | null; kindlingDate: string; buckId: string | null }>(
    db,
    "SELECT matingDate, kindlingDate, buckId FROM kindling_log WHERE doeId = ?",
    [doeId]
  );
  for (const row of kindlings) {
    const tag = await buckTag(row.buckId);
    const c = row.matingDate ? ensure(row.matingDate, tag) : ensure(row.kindlingDate, tag);
    c.kindlingDate = row.kindlingDate;
  }

  const litters = await queryAll<{
    kindlingDate: string;
    bornAlive: number;
    bornDead: number;
    weaningDate: string | null;
    weaned: number | null;
  }>(
    db,
    `SELECT l.kindlingDate, l.bornAlive, l.bornDead, l.weaningDate, l.weaned
     FROM litter l JOIN breeding b ON b.id = l.breedingId
     WHERE b.doeId = ?`,
    [doeId]
  );
  const litterByDay = new Map<string, { bornAlive: number; bornDead: number; weaningDate: string | null; weaned: number | null }>();
  for (const l of litters) {
    litterByDay.set(dayKey(l.kindlingDate), {
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
      weaningDate: l.weaningDate,
      weaned: l.weaned,
    });
  }
  for (const c of cycles.values()) {
    if (!c.kindlingDate) continue;
    const m = litterByDay.get(dayKey(c.kindlingDate));
    if (m) {
      c.bornAlive = m.bornAlive;
      c.bornDead = m.bornDead;
      c.weaningDate = m.weaningDate;
      c.weaned = m.weaned;
    }
  }

  return Array.from(cycles.values()).sort((a, b) => new Date(b.matingDate).getTime() - new Date(a.matingDate).getTime());
}

export type BuckBreedingHistoryRow = {
  doeId: string;
  doeTagId: string | null;
  doeBreed: string | null;
  matingDate: string;
  testResult: string | null;
  kindlingDate: string | null;
  bornAlive: number | null;
  bornDead: number | null;
};

/**
 * Local-SQLite port of BuckBreedingHistoryPanel (src/app/rabbits/[id]/buck-breeding-history.tsx)
 * — one row per doe he mated, keyed by doeId+matingDate since a buck's
 * cycles span many does. See fetchDoeBreedingHistory for why this can't
 * just walk Breeding rows directly.
 */
export async function fetchBuckBreedingHistory(db: SQLiteDBConnection, buckId: string): Promise<BuckBreedingHistoryRow[]> {
  const cycles = new Map<string, BuckBreedingHistoryRow>();

  async function doeInfo(doeId: string): Promise<{ tagId: string | null; breed: string | null }> {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [doeId]
    );
    return { tagId: doe?.tagId ?? null, breed: doe?.breed ?? null };
  }

  async function ensure(doeId: string, matingDate: string): Promise<BuckBreedingHistoryRow> {
    const key = `${doeId}_${matingDate}`;
    let c = cycles.get(key);
    if (!c) {
      const doe = await doeInfo(doeId);
      c = {
        doeId,
        doeTagId: doe.tagId,
        doeBreed: doe.breed,
        matingDate,
        testResult: null,
        kindlingDate: null,
        bornAlive: null,
        bornDead: null,
      };
      cycles.set(key, c);
    }
    return c;
  }

  const ongoing = await queryAll<{ matingDate: string | null; doeId: string }>(
    db,
    "SELECT matingDate, doeId FROM breeding WHERE buckId = ? AND matingDate IS NOT NULL",
    [buckId]
  );
  for (const b of ongoing) {
    if (!b.matingDate) continue;
    await ensure(b.doeId, b.matingDate);
  }

  const pregnancyTests = await queryAll<{ matingDate: string; result: string; doeId: string }>(
    db,
    "SELECT matingDate, result, doeId FROM pregnancy_test_log WHERE buckId = ?",
    [buckId]
  );
  for (const row of pregnancyTests) {
    const c = await ensure(row.doeId, row.matingDate);
    c.testResult = row.result;
  }

  const kindlings = await queryAll<{ matingDate: string | null; kindlingDate: string; doeId: string }>(
    db,
    "SELECT matingDate, kindlingDate, doeId FROM kindling_log WHERE buckId = ?",
    [buckId]
  );
  const kindlingKeyByDoeDay = new Map<string, string>();
  for (const row of kindlings) {
    const matingKey = row.matingDate ?? row.kindlingDate;
    const c = await ensure(row.doeId, matingKey);
    c.kindlingDate = row.kindlingDate;
    kindlingKeyByDoeDay.set(`${row.doeId}_${dayKey(row.kindlingDate)}`, `${row.doeId}_${matingKey}`);
  }

  const litters = await queryAll<{ kindlingDate: string; bornAlive: number; bornDead: number; doeId: string }>(
    db,
    `SELECT l.kindlingDate, l.bornAlive, l.bornDead, b.doeId as doeId
     FROM litter l JOIN breeding b ON b.id = l.breedingId
     WHERE b.buckId = ?`,
    [buckId]
  );
  for (const l of litters) {
    const cycleKey = kindlingKeyByDoeDay.get(`${l.doeId}_${dayKey(l.kindlingDate)}`);
    if (!cycleKey) continue;
    const c = cycles.get(cycleKey);
    if (c) {
      c.bornAlive = l.bornAlive;
      c.bornDead = l.bornDead;
    }
  }

  return Array.from(cycles.values()).sort((a, b) => new Date(b.matingDate).getTime() - new Date(a.matingDate).getTime());
}

export type WeightBracket = { heavy: number; medium: number; light: number; total: number };

export type FollowUpReport = {
  herd: { does: number; bucks: number };
  stock: { males: WeightBracket; females: WeightBracket };
  deaths: {
    newborn: number | null;
    weanedStock: number;
    total: number | null;
    stock: number;
    does: number;
    bucks: number;
    culledExcluded: number | null;
  };
  culls: number;
  weaning: { totalWeaned: number; sold: number; retained: number; remainingStock: number };
  health: {
    mangeStock: null; mangeDoes: null; mangeBucks: null;
    uterineInfection: null; mastitis: null;
  };
  breeding: { matings: number; pregnancyPositive: number; kindlings: number };
};

const HEAVY_G = 2250;
const MEDIUM_G = 2000;

/** Weaned-stock ledger balance as of (exclusive) a point in time — running total, not period-bound. */
async function getLocalKitStockBalanceAsOf(db: SQLiteDBConnection, toIso: string): Promise<number> {
  const weanedSum = await queryOne<{ total: number | null }>(
    db,
    "SELECT SUM(weaned) as total FROM litter WHERE weaningDate IS NOT NULL AND weaningDate < ? AND weaned IS NOT NULL",
    [toIso]
  );
  const movements = await queryAll<{ type: string; total: number }>(
    db,
    "SELECT type, SUM(count) as total FROM kit_stock_movement WHERE date < ? GROUP BY type",
    [toIso]
  );
  let sold = 0, died = 0, retained = 0;
  for (const m of movements) {
    if (m.type === "sale") sold = m.total;
    else if (m.type === "death") died = m.total;
    else if (m.type === "retained") retained = m.total;
  }
  return (weanedSum?.total ?? 0) - sold - died - retained;
}

/**
 * Local-SQLite port of getFollowUpReport (src/app/reports/report-data.ts).
 * `toIso` is the EXCLUSIVE upper bound (start of the day after the last day
 * to include) — same contract as the web version. Herd/stock counts are a
 * current snapshot; death/sale/weaning/breeding-event counts are bounded to
 * [fromIso, toIso). Untracked fields (mange, uterine infection, mastitis,
 * per-event newborn-kit death dates) are always null and must render "—".
 */
export async function fetchFollowUpReport(db: SQLiteDBConnection, fromIso: string, toIso: string): Promise<FollowUpReport> {
  const [does, bucks] = await Promise.all([
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status = 'active'"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status = 'active'"),
  ]);

  const stockRabbits = await queryAll<{ id: string; sex: string }>(
    db,
    "SELECT id, sex FROM rabbit WHERE tagId IS NULL AND status = 'active'"
  );
  const males: WeightBracket = { heavy: 0, medium: 0, light: 0, total: 0 };
  const females: WeightBracket = { heavy: 0, medium: 0, light: 0, total: 0 };
  for (const r of stockRabbits) {
    const bracket = r.sex === "buck" ? males : r.sex === "doe" ? females : null;
    if (!bracket) continue;
    bracket.total++;
    const w = await queryOne<{ weightGrams: number }>(
      db,
      "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC LIMIT 1",
      [r.id]
    );
    if (!w) continue;
    if (w.weightGrams >= HEAVY_G) bracket.heavy++;
    else if (w.weightGrams >= MEDIUM_G) bracket.medium++;
    else bracket.light++;
  }

  const [
    weanedStockDeathAgg,
    stockDeaths,
    doeDeaths,
    buckDeaths,
    culls,
    weanedLittersInRange,
    soldAgg,
    retainedAgg,
    remainingStock,
    matings,
    pregnancyPositive,
    kindlings,
  ] = await Promise.all([
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(count) as total FROM kit_stock_movement WHERE type = 'death' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE tagId IS NULL AND status = 'deceased' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status = 'deceased' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status = 'deceased' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE status = 'culled' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryAll<{ weaned: number }>(
      db,
      "SELECT weaned FROM litter WHERE weaningDate >= ? AND weaningDate < ? AND weaned IS NOT NULL",
      [fromIso, toIso]
    ),
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(count) as total FROM kit_stock_movement WHERE type = 'sale' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(count) as total FROM kit_stock_movement WHERE type = 'retained' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    getLocalKitStockBalanceAsOf(db, toIso),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM breeding WHERE matingDate >= ? AND matingDate < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM pregnancy_test_log WHERE result = 'positive' AND testDate >= ? AND testDate < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM kindling_log WHERE kindlingDate >= ? AND kindlingDate < ?",
      [fromIso, toIso]
    ),
  ]);

  const totalWeaned = weanedLittersInRange.reduce((s, l) => s + (l.weaned ?? 0), 0);

  return {
    herd: { does: does?.count ?? 0, bucks: bucks?.count ?? 0 },
    stock: { males, females },
    deaths: {
      newborn: null,
      weanedStock: weanedStockDeathAgg?.total ?? 0,
      total: null,
      stock: stockDeaths?.count ?? 0,
      does: doeDeaths?.count ?? 0,
      bucks: buckDeaths?.count ?? 0,
      culledExcluded: null,
    },
    culls: culls?.count ?? 0,
    weaning: {
      totalWeaned,
      sold: soldAgg?.total ?? 0,
      retained: retainedAgg?.total ?? 0,
      remainingStock,
    },
    health: {
      mangeStock: null,
      mangeDoes: null,
      mangeBucks: null,
      uterineInfection: null,
      mastitis: null,
    },
    breeding: {
      matings: matings?.count ?? 0,
      pregnancyPositive: pregnancyPositive?.count ?? 0,
      kindlings: kindlings?.count ?? 0,
    },
  };
}

