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

export type DashboardStats = {
  totalRabbits: number;
  activeDoes: number;
  activeBucks: number;
  totalLitters: number;
  activeBreedings: number;
};

export async function fetchDashboardStats(db: SQLiteDBConnection): Promise<DashboardStats> {
  const [totalRabbits, activeDoes, activeBucks, totalLitters, activeBreedings] = await Promise.all([
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE status != 'deceased'"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status != 'deceased'"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status != 'deceased'"),
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
  }>(
    db,
    "SELECT id, tagId, breed, doeState FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status != 'deceased' AND doeState IN ('empty', 'nursing', 'excluded') ORDER BY tagId ASC"
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

    does.push({ id: doe.id, tagId: doe.tagId, breed: doe.breed, doeState: doe.doeState, breedings });
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
     WHERE r.sex = 'doe' AND r.tagId IS NOT NULL AND r.status != 'deceased' 
       AND r.doeState IN ('bred', 'nursing_bred')
     ORDER BY r.tagId ASC`
  );

  const candidates: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; buckTagId: string | null; breedingId: string }[] = [];
  for (const c of candidatesRaw) {
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

  // Generate a test log from closed breeding attempts where pregnancyTestResult is resolved
  const logRows = await queryAll<{
    id: string;
    matingDate: string | null;
    updatedAt: string;
    pregnancyTestResult: string;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    "SELECT id, matingDate, updatedAt, pregnancyTestResult, doeId, buckId FROM breeding WHERE pregnancyTestResult IN ('positive', 'negative') ORDER BY updatedAt DESC LIMIT 100"
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
      testDate: row.updatedAt,
      result: row.pregnancyTestResult,
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
     WHERE sex = 'doe' AND tagId IS NOT NULL AND status != 'deceased' 
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

    if (!b || !b.matingDate || b.nestBoxDate) continue;

    const dueDate = nestBoxDueDate(new Date(b.matingDate), settings.nestBoxDays);
    if (dueDate > today) continue;

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
  const rows = await queryAll<{
    id: string;
    tagId: string | null;
    breed: string | null;
    doeState: string;
    breedingId: string;
    matingDate: string | null;
    expectedKindlingDate: string;
    buckId: string | null;
  }>(
    db,
    `SELECT r.id, r.tagId, r.breed, r.doeState, b.id as breedingId, b.matingDate, b.expectedKindlingDate, b.buckId 
     FROM rabbit r
     JOIN breeding b ON r.id = b.doeId
     WHERE r.sex = 'doe' AND r.tagId IS NOT NULL AND r.status != 'deceased' 
       AND r.doeState IN ('pregnant', 'bred', 'nursing_bred')
       AND b.actualKindlingDate IS NULL
     ORDER BY b.expectedKindlingDate ASC`
  );

  const does: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; expectedKindlingDate: string; buckTagId: string | null; breedingId: string }[] = [];
  for (const c of rows) {
    const buck = c.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [c.buckId])
      : null;
    does.push({
      id: c.id,
      tagId: c.tagId,
      breed: c.breed,
      doeState: c.doeState,
      matingDate: c.matingDate,
      expectedKindlingDate: c.expectedKindlingDate,
      buckTagId: buck?.tagId ?? null,
      breedingId: c.breedingId,
    });
  }

  // Get kindling log entries derived from litter table
  const logRows = await queryAll<{
    id: string;
    breedingId: string;
    kindlingDate: string;
    bornAlive: number;
    bornDead: number;
    doeId: string;
    buckId: string | null;
    matingDate: string | null;
  }>(
    db,
    `SELECT l.id, l.breedingId, l.kindlingDate, l.bornAlive, l.bornDead, b.doeId, b.buckId, b.matingDate
     FROM litter l
     JOIN breeding b ON l.breedingId = b.id
     ORDER BY l.kindlingDate DESC LIMIT 100`
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
    kindlingLog.push({
      id: row.id,
      breedingId: row.breedingId,
      kindlingDate: row.kindlingDate,
      matingDate: row.matingDate,
      bornAlive: row.bornAlive,
      bornDead: row.bornDead,
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
     WHERE sex = 'doe' AND tagId IS NOT NULL AND status != 'deceased' 
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

    const b = breedings[0];
    const prev = breedings[1];

    // Check if previous breeding has ongoing litter
    let prevOngoingLitter = false;
    if (prev && prev.actualKindlingDate) {
      const prevLitter = await queryOne<{ weaningDate: string | null }>(
        db,
        "SELECT weaningDate FROM litter WHERE breedingId = ?",
        [prev.id]
      );
      prevOngoingLitter = !prevLitter || !prevLitter.weaningDate;
    }

    const litterRow = (prevOngoingLitter && (!b || !b.actualKindlingDate)) ? prev : b;
    if (!litterRow || !litterRow.actualKindlingDate) continue;

    const litter = await queryOne<{ id: string; bornAlive: number; bornDead: number; weaningDate: string | null }>(
      db,
      "SELECT id, bornAlive, bornDead, weaningDate FROM litter WHERE breedingId = ?",
      [litterRow.id]
    );

    if (!litter || litter.weaningDate) continue;

    const dueDate = weaningDueDate(new Date(litterRow.actualKindlingDate), settings.weaningDays);
    if (dueDate > today) continue;

    const buck = litterRow.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [litterRow.buckId])
      : null;

    litters.push({
      id: litter.id,
      breedingId: litterRow.id,
      kindlingDate: litterRow.actualKindlingDate,
      bornAlive: litter.bornAlive,
      bornDead: litter.bornDead,
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
  let query = "SELECT * FROM rabbit WHERE status != 'deceased'";
  const params: unknown[] = [];
  if (sexFilter === "doe") {
    query += " AND sex = 'doe' AND tagId IS NOT NULL";
  } else if (sexFilter === "buck") {
    query += " AND sex = 'buck' AND tagId IS NOT NULL";
  }
  query += " ORDER BY tagId ASC, id ASC";
  return queryAll<LocalRabbit>(db, query, params);
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
  kind: "wean" | "sale" | "death" | "retained";
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
      kind: m.type as "sale" | "death" | "retained",
      count: -m.count,
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
  const availableStock = totalWeaned - totalSold - totalDied - totalRetained;

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
  breed: string | null;
  sex: string;
  updatedAt: string;
};

export async function fetchMortalityPageData(db: SQLiteDBConnection): Promise<{
  activeMothers: LocalRabbit[];
  activeBucks: LocalRabbit[];
  activeStock: LocalRabbit[];
  deceasedRabbits: LocalDeceasedRabbit[];
  nursingDoes: { doe: { id: string; tagId: string; breed: string }; breedingId: string; litter: { bornAlive: number; bornDead: number } }[];
  availableWeanedStock: number;
}> {
  // 1. Active mothers (does with tagId)
  const activeMothers = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status != 'deceased' AND sex = 'doe' AND tagId IS NOT NULL ORDER BY tagId ASC, id ASC"
  );

  // 2. Active bucks (bucks with tagId)
  const activeBucks = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status != 'deceased' AND sex = 'buck' AND tagId IS NOT NULL ORDER BY tagId ASC, id ASC"
  );

  // 3. Active stock (rabbits without tagId)
  const activeStock = await queryAll<LocalRabbit>(
    db,
    "SELECT * FROM rabbit WHERE status != 'deceased' AND tagId IS NULL ORDER BY id ASC"
  );

  // 4. Deceased rabbits log
  const deceasedRabbits = await queryAll<LocalDeceasedRabbit>(
    db,
    "SELECT id, tagId, breed, sex, updatedAt FROM rabbit WHERE status = 'deceased' ORDER BY updatedAt DESC LIMIT 100"
  );

  // 5. Nursing does
  const does = await queryAll<{ id: string; tagId: string; breed: string }>(
    db,
    "SELECT id, tagId, breed FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status != 'deceased' ORDER BY tagId ASC"
  );
  const nursingDoes: { doe: { id: string; tagId: string; breed: string }; breedingId: string; litter: { bornAlive: number; bornDead: number } }[] = [];
  for (const doe of does) {
    const latestBreeding = await queryOne<{ id: string; actualKindlingDate: string | null }>(
      db,
      "SELECT id, actualKindlingDate FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 1",
      [doe.id]
    );
    if (latestBreeding && latestBreeding.actualKindlingDate) {
      const litter = await queryOne<{ bornAlive: number; bornDead: number; weaningDate: string | null }>(
        db,
        "SELECT bornAlive, bornDead, weaningDate FROM litter WHERE breedingId = ?",
        [latestBreeding.id]
      );
      if (litter && litter.bornAlive > 0 && !litter.weaningDate) {
        nursingDoes.push({
          doe: { id: doe.id, tagId: doe.tagId, breed: doe.breed },
          breedingId: latestBreeding.id,
          litter: { bornAlive: litter.bornAlive, bornDead: litter.bornDead },
        });
      }
    }
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

  return { activeMothers, activeBucks, activeStock, deceasedRabbits, nursingDoes, availableWeanedStock };
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
    "SELECT * FROM rabbit WHERE status != 'deceased' ORDER BY tagId ASC, id ASC"
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

