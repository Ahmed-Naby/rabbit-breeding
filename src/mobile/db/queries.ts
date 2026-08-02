/**
 * Local-SQLite equivalents of the does board's Prisma selects
 * (src/app/does/page.tsx) — feeds the same shared src/lib/does-board.ts
 * row-derivation logic the web Server Component uses, so the two boards can
 * never drift in behavior, only in how the rows are fetched.
 */
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { queryAll, queryOne } from "./helpers";
import type { LocalSettings, LocalRabbit } from "./types";
import { computeDoeBoardRow, rebreedCooldownElapsed, type DoeBoardBreeding } from "@/lib/does-board";
import type { DoeState } from "@/lib/enums";
import { weaningDueDate, nestBoxDueDate, daysUntil } from "@/lib/dates";
import { resolveBornDeadAtKindling, weaningSurvivalRate } from "@/lib/kit-mortality";
import { naturalCompare } from "@/lib/sortable";
import {
  computeBreedingAverages,
  type BreedingAverages,
  type AverageKindlingRow,
  type AverageWeaningRow,
} from "@/lib/breeding-averages";
import {
  computeHerdProductivity,
  findIdleDoes,
  rebreedTarget,
  type HerdKindlingRow,
  type HerdReport,
} from "@/lib/herd-productivity";
import {
  resolveNursingLitterRow,
  isWeaningCandidate,
  isNestBoxCandidate,
  isPregnancyTestCandidate,
  isKindlingCandidate,
  isNursingKitDeathCandidate,
  type BaseBreeding
} from "@/lib/breeding-filters";
import { fosterWindowStart, splitFosterCandidates, type FosterCandidate } from "@/lib/fostering";
import type { HerdComposition } from "@/lib/feed-plan";

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
  gestationDays: 30,
  gestationWindowDays: 3,
  pregnancyTestDays: 10,
  palpationCheckDays: 15,
  weaningDays: 28,
  nestBoxDays: 27,
  matingWeightGrams: 3000,
  rebreedAfterKindlingDays: 0,
  fosterWindowDays: 2,
  fosterHighKits: 8,
  fosterLowKits: 4,
  currency: "EGP",
  defaultPricePerKgCents: 0,
  feedPricePerTonCents: 0,
  feedGramsDoeIdlePerDay: 0,
  feedGramsDoePregnantPerDay: 0,
  feedGramsDoeNursingPerDay: 0,
  feedGramsBuckPerDay: 0,
  feedGramsGrowerPerDay: 0,
  feedGramsJuvenilePerDay: 0,
  recurringExpenses: null,
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
      palpationConfirmedDate: string | null;
      buckId: string | null;
    }>(
      db,
      "SELECT id, matingDate, actualKindlingDate, palpationConfirmedDate, buckId FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 2",
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
        weaningWeightGrams: number | null;
      }>(
        db,
        "SELECT bornAlive, bornDead, weaned, weaningDate, weaningWeightGrams FROM litter WHERE breedingId = ?",
        [b.id]
      );

      breedings.push({
        id: b.id,
        matingDate: toDate(b.matingDate),
        actualKindlingDate: toDate(b.actualKindlingDate),
        palpationConfirmedDate: toDate(b.palpationConfirmedDate),
        buckTagId: buck?.tagId ?? null,
        litter: litter
          ? {
              bornAlive: litter.bornAlive,
              bornDead: litter.bornDead,
              weaned: litter.weaned,
              weaningDate: toDate(litter.weaningDate),
              weaningWeightGrams: litter.weaningWeightGrams,
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

/**
 * Local mirror of matingDateUsedOp: has this doe already got a mating archived
 * on `dateValue` (a yyyy-MM-dd input value)? Backs the does board's "تلقيح"
 * button, disabled for a date she's already been mated on. mating_log.matingDate
 * is stored in mixed shapes (full ISO from startBreeding/markMated and server
 * pulls, bare yyyy-MM-dd from an older setMatingDate), so we compare on the
 * leading day slice, which both shapes share.
 */
export async function matingDateUsedLocally(
  db: SQLiteDBConnection,
  doeId: string,
  dateValue: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM mating_log WHERE doeId = ? AND substr(matingDate, 1, 10) = ? LIMIT 1",
    [doeId, dateValue]
  );
  return !!row;
}

/** A pending breeding, for the الولادات card. */
export type DashboardKindlingRow = {
  breedingId: string;
  doeId: string;
  doeTagId: string | null;
  expectedKindlingDate: string;
  /** Negative = overdue by that many days. Frozen at fetch time, like the web's. */
  daysLeft: number;
};

/** A health record with a due date, for the مهام صحية card. */
export type DashboardHealthRow = {
  id: string;
  rabbitId: string;
  rabbitTagId: string | null;
  type: string;
  nextDueDate: string;
  daysLeft: number;
};

export type DashboardStatusCount = { status: string; count: number };

/** A weaned cycle, for the ولادات حديثة survival trend. */
export type DashboardWeaningRow = {
  id: string;
  /** Kindling date when the archive kept one, else the weaning date. */
  displayDate: string;
  /** 0–1, or null when the row predates bornDeadAtKindling (see kit-mortality). */
  survival: number | null;
};

export type DashboardStats = {
  stockCount: number;
  activeDoes: number;
  activeBucks: number;
  readyForMating: number;
  readyForPregnancyTest: number;
  expectedKindlings: number;
  nestBoxesDue: number;
  /** Later than the gestation window allows — rendered in the warn style. */
  overdueKindlings: DashboardKindlingRow[];
  /** Inside the window and up to 14 days out, same cut-off as the web. */
  upcomingKindlings: DashboardKindlingRow[];
  overdueHealth: DashboardHealthRow[];
  /** Due within 30 days. The card itself shows only the first 6, as on web. */
  upcomingHealth: DashboardHealthRow[];
  statusCounts: DashboardStatusCount[];
  totalRabbits: number;
  recentWeanings: DashboardWeaningRow[];
};

/** Same eligibility rule as /mating's board (mobile mating-page.tsx: no rebreed-cooldown filter applied there, unlike the web board). */
/**
 * Mirrors the mating board's eligibility so the tile and the list it links to
 * always report the same number — a مرضعة is only ready once her rebreed
 * cooldown has elapsed, which this counter used to ignore.
 */
async function countReadyForMating(db: SQLiteDBConnection, settings: LocalSettings): Promise<number> {
  const rows = await queryAll<{ doeState: string; kindlingDate: string | null }>(
    db,
    `SELECT r.doeState,
            (SELECT b.actualKindlingDate FROM breeding b
              WHERE b.doeId = r.id ORDER BY b.createdAt DESC LIMIT 1) as kindlingDate
       FROM rabbit r
      WHERE r.sex = 'doe' AND r.tagId IS NOT NULL
        AND r.status NOT IN ('deceased', 'culled', 'resting')
        AND r.doeState IN ('empty', 'nursing', 'excluded')`
  );
  return rows.filter(
    (r) =>
      r.doeState !== "nursing" ||
      rebreedCooldownElapsed(toDate(r.kindlingDate), settings.rebreedAfterKindlingDays)
  ).length;
}

/** Mirrors fetchPregnancyPageData's candidate filter, counted without the log/buck joins the full page needs. */
async function countReadyForPregnancyTest(db: SQLiteDBConnection, settings: LocalSettings): Promise<number> {
  const rows = await queryAll<{ breedingId: string; matingDate: string | null }>(
    db,
    `SELECT b.id as breedingId, b.matingDate FROM rabbit r
     JOIN breeding b ON r.id = b.doeId
     WHERE r.sex = 'doe' AND r.tagId IS NOT NULL AND r.status NOT IN ('deceased', 'culled')
       AND r.doeState IN ('bred', 'nursing_bred')`
  );
  const today = new Date();
  return rows.filter((r) =>
    isPregnancyTestCandidate({ id: r.breedingId, matingDate: r.matingDate, actualKindlingDate: null }, settings.pregnancyTestDays, today)
  ).length;
}

/** Mirrors fetchNestBoxPageData's candidate filter (one latest breeding per doe). */
async function countNestBoxesDue(db: SQLiteDBConnection, settings: LocalSettings): Promise<number> {
  const does = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') AND doeState IN ('bred', 'pregnant', 'nursing_bred', 'nursing_pregnant')"
  );
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let count = 0;
  for (const doe of does) {
    const b = await queryOne<{ id: string; matingDate: string | null; nestBoxDate: string | null }>(
      db,
      "SELECT id, matingDate, nestBoxDate FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 1",
      [doe.id]
    );
    if (b && isNestBoxCandidate({ id: b.id, matingDate: b.matingDate, nestBoxDate: b.nestBoxDate, actualKindlingDate: null }, settings.nestBoxDays, today)) {
      count++;
    }
  }
  return count;
}

/** Mirrors fetchKindlingPageData's candidate filter (one latest breeding per doe). */
async function countExpectedKindlings(db: SQLiteDBConnection, settings: LocalSettings): Promise<number> {
  const does = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') AND doeState IN ('pregnant', 'nursing_pregnant')"
  );
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let count = 0;
  for (const doe of does) {
    const b = await queryOne<{ id: string; matingDate: string | null }>(
      db,
      "SELECT id, matingDate FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 1",
      [doe.id]
    );
    if (b && isKindlingCandidate({ id: b.id, matingDate: b.matingDate, actualKindlingDate: null }, settings.gestationDays, today)) {
      count++;
    }
  }
  return count;
}

/**
 * Every breeding still awaiting an outcome — the الولادات card's source, and
 * the same `outcome = 'pending'` set the web dashboard pulls. Split into
 * overdue/upcoming by the caller, which needs gestationWindowDays.
 */
async function fetchPendingKindlings(db: SQLiteDBConnection): Promise<DashboardKindlingRow[]> {
  const rows = await queryAll<Omit<DashboardKindlingRow, "daysLeft">>(
    db,
    `SELECT b.id as breedingId, b.doeId, r.tagId as doeTagId, b.expectedKindlingDate
       FROM breeding b JOIN rabbit r ON r.id = b.doeId
      WHERE b.outcome = 'pending'
      ORDER BY b.expectedKindlingDate ASC`
  );
  return rows.map((r) => ({ ...r, daysLeft: daysUntil(new Date(r.expectedKindlingDate)) }));
}

/** Health records carrying a follow-up date — the مهام صحية card's source. */
async function fetchDueHealth(db: SQLiteDBConnection): Promise<DashboardHealthRow[]> {
  const rows = await queryAll<Omit<DashboardHealthRow, "daysLeft">>(
    db,
    `SELECT h.id, h.rabbitId, r.tagId as rabbitTagId, h.type, h.nextDueDate
       FROM health_record h JOIN rabbit r ON r.id = h.rabbitId
      WHERE h.nextDueDate IS NOT NULL
      ORDER BY h.nextDueDate ASC`
  );
  return rows.map((r) => ({ ...r, daysLeft: daysUntil(new Date(r.nextDueDate)) }));
}

/**
 * The last few weaned cycles and how much of each litter survived to weaning.
 *
 * Reads weaning_log, NOT litter as the web dashboard does. The litter row is
 * recycled by the doe's next kindling, so on a farm that keeps breeding, "the
 * six most recent weanings" read off litter quietly becomes "the six does who
 * haven't re-kindled yet" — the same recycling that made إجمالي الفطام read 20
 * against weaning_log's 41. The archive carries bornAlive/bornDead/
 * bornDeadAtKindling/weaned on the row itself, so the survival rate needs no
 * join and can't drift from what الفطام والبيع shows in this same bundle.
 */
async function fetchRecentWeanings(db: SQLiteDBConnection): Promise<DashboardWeaningRow[]> {
  const rows = await queryAll<{
    id: string;
    kindlingDate: string | null;
    weaningDate: string;
    bornAlive: number;
    bornDead: number;
    bornDeadAtKindling: number;
    weaned: number | null;
  }>(
    db,
    `SELECT id, kindlingDate, weaningDate, bornAlive, bornDead, bornDeadAtKindling, weaned
       FROM weaning_log
      WHERE weaned IS NOT NULL
      ORDER BY COALESCE(kindlingDate, weaningDate) DESC
      LIMIT 6`
  );
  return rows.map((r) => ({
    id: r.id,
    displayDate: r.kindlingDate ?? r.weaningDate,
    survival: weaningSurvivalRate(r),
  }));
}

export async function fetchDashboardStats(db: SQLiteDBConnection): Promise<DashboardStats> {
  const settings = await getLocalSettings(db);
  const [
    stockCount,
    activeDoes,
    activeBucks,
    readyForMating,
    readyForPregnancyTest,
    expectedKindlings,
    nestBoxesDue,
    pendingKindlings,
    dueHealth,
    statusRows,
    recentWeanings,
  ] = await Promise.all([
    // Same filter as /stock: untagged juveniles not yet promoted to the breeding herd pen.
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE tagId IS NULL AND movedToHerdPen = 0 AND status NOT IN ('deceased', 'culled')"),
    // status = 'active', not "not dead": these two cards say النشطة, and the web
    // dashboard counts them that way (src/app/page.tsx). A مستريح buck is a real
    // status of its own, so "not deceased and not culled" quietly counted him as
    // active and the phone read 25 bucks against the web's 24.
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status = 'active'"),
    queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status = 'active'"),
    countReadyForMating(db, settings),
    countReadyForPregnancyTest(db, settings),
    countExpectedKindlings(db, settings),
    countNestBoxesDue(db, settings),
    fetchPendingKindlings(db),
    fetchDueHealth(db),
    // Every rabbit, untagged stock included — this is the herd headcount the
    // card's title reports, not the breeding herd.
    queryAll<DashboardStatusCount>(db, "SELECT status, COUNT(*) as count FROM rabbit GROUP BY status"),
    fetchRecentWeanings(db),
  ]);

  // Same two windows as the web dashboard: a doe is only "late" once she is
  // past the whole gestation window, and the upcoming list stops at 14 days so
  // it stays a to-do list rather than a calendar.
  const win = settings.gestationWindowDays;

  return {
    stockCount: stockCount?.count ?? 0,
    activeDoes: activeDoes?.count ?? 0,
    activeBucks: activeBucks?.count ?? 0,
    readyForMating,
    readyForPregnancyTest,
    expectedKindlings,
    nestBoxesDue,
    overdueKindlings: pendingKindlings.filter((b) => b.daysLeft < -win),
    upcomingKindlings: pendingKindlings.filter((b) => b.daysLeft >= -win && b.daysLeft <= 14),
    overdueHealth: dueHealth.filter((r) => r.daysLeft < 0),
    upcomingHealth: dueHealth.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30),
    statusCounts: statusRows,
    totalRabbits: statusRows.reduce((s, r) => s + r.count, 0),
    recentWeanings,
  };
}

export type MatingLogEntry = {
  id: string;
  matingDate: string;
  doeTagId: string | null;
  doeBreed: string | null;
  wasNursingAtMating: boolean;
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
      palpationConfirmedDate: string | null;
      buckId: string | null;
    }>(
      db,
      "SELECT id, matingDate, actualKindlingDate, palpationConfirmedDate, buckId FROM breeding WHERE doeId = ? ORDER BY createdAt DESC LIMIT 2",
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
        weaningWeightGrams: number | null;
      }>(
        db,
        "SELECT bornAlive, bornDead, weaned, weaningDate, weaningWeightGrams FROM litter WHERE breedingId = ?",
        [b.id]
      );

      breedings.push({
        id: b.id,
        matingDate: toDate(b.matingDate),
        actualKindlingDate: toDate(b.actualKindlingDate),
        palpationConfirmedDate: toDate(b.palpationConfirmedDate),
        buckTagId: buck?.tagId ?? null,
        litter: litter
          ? {
              bornAlive: litter.bornAlive,
              bornDead: litter.bornDead,
              weaned: litter.weaned,
              weaningDate: toDate(litter.weaningDate),
              weaningWeightGrams: litter.weaningWeightGrams,
            }
          : null,
      });
    }

    does.push({ id: doe.id, tagId: doe.tagId, breed: doe.breed, doeState: doe.doeState, status: doe.status, breedings });
  }

  // The SQL above only filters on حالة الأم, so a مرضعة still inside her
  // rebreed cooldown came back and sat under «أمهات جاهزة للتلقيح» with a dead
  // «تلقيح» button. Filtering on the row's own canMate — the very value
  // MateCell renders from — mirrors what the web board does at query level and
  // means the list can never hold a doe you are not allowed to mate.
  const readyDoes = does.filter(
    (doe) => computeDoeBoardRow(doe.doeState as DoeState, doe.status, doe.breedings, settings).canMate
  );

  const logRows = await queryAll<{
    id: string;
    matingDate: string;
    doeId: string;
    buckId: string | null;
    wasNursingAtMating: number;
  }>(
    db,
    "SELECT id, matingDate, doeId, buckId, wasNursingAtMating FROM mating_log ORDER BY matingDate DESC"
  );

  const matingLog: MatingLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
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
      wasNursingAtMating: row.wasNursingAtMating === 1,
      buckTagId: buck?.tagId ?? null,
    });
  }

  return { does: readyDoes, matingLog, settings };
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
    "SELECT id, matingDate, testDate, result, doeId, buckId FROM pregnancy_test_log ORDER BY testDate DESC"
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

export type ResorptionLogEntry = {
  id: string;
  matingDate: string;
  resorptionDate: string;
  doeTagId: string | null;
  doeBreed: string | null;
  buckTagId: string | null;
};

export async function fetchResorptionPageData(db: SQLiteDBConnection): Promise<{
  resorptionLog: ResorptionLogEntry[];
}> {
  const logRows = await queryAll<{
    id: string;
    matingDate: string;
    resorptionDate: string;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    "SELECT id, matingDate, resorptionDate, doeId, buckId FROM resorption_log ORDER BY resorptionDate DESC"
  );

  const resorptionLog: ResorptionLogEntry[] = [];
  for (const row of logRows) {
    const doe = await queryOne<{ tagId: string | null; breed: string | null }>(
      db,
      "SELECT tagId, breed FROM rabbit WHERE id = ?",
      [row.doeId]
    );
    const buck = row.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [row.buckId])
      : null;
    resorptionLog.push({
      id: row.id,
      matingDate: row.matingDate,
      resorptionDate: row.resorptionDate,
      doeTagId: doe?.tagId ?? null,
      doeBreed: doe?.breed ?? null,
      buckTagId: buck?.tagId ?? null,
    });
  }

  return { resorptionLog };
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
     ORDER BY nestBoxDate DESC`
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
  /** Live kits at the ولادة press, frozen — never touched by fostering. */
  bornAliveAtKindling: number;
  /** Stillborn at the ولادة press, frozen. `-1` = row predates the column. */
  bornDeadAtKindling: number;
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

  // 2. Fetch kindling log from local kindling_log table. This is an
  // append-only archive, so it reads the *AtKindling pair, written once at the
  // ولادة press: the plain bornAlive/bornDead on the same row are mirrored
  // «الرعاية» counts that fostering and pre-weaning deaths keep editing, which
  // would silently rewrite what the doe is recorded as having produced.
  const logRows = await queryAll<{
    id: string;
    matingDate: string | null;
    kindlingDate: string;
    breedingId: string | null;
    bornAliveAtKindling: number | null;
    bornDeadAtKindling: number | null;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    "SELECT id, matingDate, kindlingDate, breedingId, bornAliveAtKindling, bornDeadAtKindling, doeId, buckId FROM kindling_log ORDER BY kindlingDate DESC"
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
      breedingId: row.breedingId ?? "",
      kindlingDate: row.kindlingDate,
      matingDate: row.matingDate,
      bornAliveAtKindling: row.bornAliveAtKindling ?? 0,
      // -1 is the "row predates the column" sentinel and must survive the read:
      // it renders «—», where a real 0 renders as a genuine zero stillborn.
      bornDeadAtKindling: row.bornDeadAtKindling ?? -1,
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
  /**
   * Frozen stillborn count of this cycle, off kindling_log — the litter table
   * has no such column, and bornDead above is stillborns + nursing deaths
   * added together. Their gap is «نافق الرعاية», which is what the board
   * shows. `-1` when no kindling row matches (see kit-mortality.ts).
   */
  bornDeadAtKindling: number;
  // Editable on the weaning page before "فطام" is pressed, same as the web.
  weaned: number | null;
  weaningWeightGrams: number | null;
  doeId: string;
  doeTagId: string | null;
  doeBreed: string | null;
  doeState: string;
  buckTagId: string | null;
};

export type WeanedLitterLogEntry = {
  id: string;
  breedingId: string;
  kindlingDate: string | null;
  weaningDate: string;
  bornAlive: number;
  bornDead: number;
  /** Frozen at birth; the gap from bornDead is «نافق الرعاية». -1 = unknown. */
  bornDeadAtKindling: number;
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
    const litRow = await queryOne<{
      id: string;
      weaned: number | null;
      weaningWeightGrams: number | null;
    }>(
      db,
      "SELECT id, weaned, weaningWeightGrams FROM litter WHERE breedingId = ?",
      [resolved.id]
    );

    const buck = originalBreeding.buckId
      ? await queryOne<{ tagId: string | null }>(db, "SELECT tagId FROM rabbit WHERE id = ?", [originalBreeding.buckId])
      : null;

    // Newest first, so this is the cycle on screen: a reused breeding row
    // carries one kindling_log row per cycle, and kindlingDate is a date (not
    // a timestamp), so createdAt breaks a same-day tie.
    const kindling = await queryOne<{ bornDeadAtKindling: number }>(
      db,
      `SELECT bornDeadAtKindling FROM kindling_log WHERE breedingId = ?
       ORDER BY kindlingDate DESC, createdAt DESC LIMIT 1`,
      [resolved.id]
    );
    // Second road when that row can't answer (a cycle whose kindling row was
    // never linked to its breeding): the dated نافق presses are the nursing
    // deaths directly. Date part only — a local row carries "YYYY-MM-DD" and a
    // pulled one the server's full timestamp. See resolveBornDeadAtKindling.
    const deaths =
      kindling && kindling.bornDeadAtKindling >= 0
        ? null
        : await queryOne<{ n: number; total: number | null }>(
            db,
            `SELECT COUNT(*) AS n, SUM(count) AS total FROM kit_death_log
             WHERE doeId = ? AND substr(kindlingDate, 1, 10) = substr(?, 1, 10)`,
            [doe.id, originalBreeding.actualKindlingDate]
          );

    litters.push({
      id: litRow?.id ?? "",
      breedingId: originalBreeding.id,
      kindlingDate: originalBreeding.actualKindlingDate!,
      bornAlive: resolved.litter!.bornAlive,
      bornDead: resolved.litter!.bornDead,
      bornDeadAtKindling: resolveBornDeadAtKindling({
        fromKindlingLog: kindling?.bornDeadAtKindling,
        bornDead: resolved.litter!.bornDead,
        // No rows is "no evidence", not "no deaths".
        recordedKitDeaths: !deaths || deaths.n === 0 ? null : (deaths.total ?? 0),
      }),
      weaned: litRow?.weaned ?? null,
      weaningWeightGrams: litRow?.weaningWeightGrams ?? null,
      doeId: doe.id,
      doeTagId: doe.tagId,
      doeBreed: doe.breed,
      doeState: doe.doeState,
      buckTagId: buck?.tagId ?? null,
    });
  }

  // 2. Get weaned log entries from the append-only weaning_log table (mirrors
  // the server WeaningLog). Reading straight from this archive — rather than
  // deriving from the live litter row — is what makes prior weaning cycles
  // survive a re-mate of the same doe (which reuses the breeding/litter row).
  const logRows = await queryAll<{
    id: string;
    breedingId: string | null;
    kindlingDate: string | null;
    weaningDate: string;
    bornAlive: number;
    bornDead: number;
    bornDeadAtKindling: number;
    weaned: number | null;
    weaningWeightGrams: number | null;
    doeId: string;
    buckId: string | null;
  }>(
    db,
    `SELECT id, breedingId, kindlingDate, weaningDate, bornAlive, bornDead, bornDeadAtKindling,
            weaned, weaningWeightGrams, doeId, buckId
     FROM weaning_log
     ORDER BY weaningDate DESC`
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
      id: row.id,
      breedingId: row.breedingId ?? "",
      kindlingDate: row.kindlingDate,
      weaningDate: row.weaningDate,
      bornAlive: row.bornAlive,
      bornDead: row.bornDead,
      bornDeadAtKindling: row.bornDeadAtKindling,
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
  large: FosterCandidate[];
  small: FosterCandidate[];
}> {
  const settings = await getLocalSettings(db);

  // Fresh, still-nursing litters — same rule as the web page (see lib/fostering).
  const candidateRows = await queryAll<{
    doeId: string;
    tagId: string | null;
    cage: string | null;
    kindlingDate: string;
    bornAlive: number;
  }>(
    db,
    `SELECT r.id AS doeId, r.tagId AS tagId, r.cage AS cage,
            l.kindlingDate AS kindlingDate, l.bornAlive AS bornAlive
       FROM litter l
       JOIN breeding b ON b.id = l.breedingId
       JOIN rabbit r ON r.id = b.doeId
      WHERE l.weaningDate IS NULL
        AND l.kindlingDate >= ?
        AND r.status = 'active'`,
    [fosterWindowStart(settings.fosterWindowDays).toISOString()]
  );
  const { large, small } = splitFosterCandidates(
    candidateRows.map((row) => ({
      doeId: row.doeId,
      tagId: row.tagId,
      cage: row.cage,
      kindlingDate: new Date(row.kindlingDate),
      kits: row.bornAlive,
    })),
    settings.fosterHighKits,
    settings.fosterLowKits
  );
  const rows = await queryAll<{
    id: string;
    fromDoeId: string;
    toDoeId: string;
    count: number;
    date: string;
  }>(db, "SELECT id, fromDoeId, toDoeId, count, date FROM foster_log ORDER BY date DESC, createdAt DESC");

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

  return { logs, settings, large, small };
}

export type LocalKitLedgerEntry = {
  key: string;
  date: string;
  kind: "wean" | "sale" | "death" | "retained" | "adjustment" | "returned";
  count: number;
  weightGrams?: number | null;
  pricePerKgCents?: number | null;
  amountCents?: number | null;
  notes?: string | null;
  id?: string;
};

/**
 * The available weaned-kit balance: kits weaned in, minus those sold, died,
 * or retained to breeding, plus signed manual adjustments and any سلالة sent
 * back here by being deleted. Shared by every page that gates on it
 * (weaning-sales, mortality, stock intake) so the number and its "never
 * negative" guard stay consistent everywhere.
 */
export async function computeAvailableWeanedStock(db: SQLiteDBConnection): Promise<number> {
  // weaning_log, NOT litter: a breeding row and its litter are reused every
  // cycle, and markKindled nulls weaningDate/weaned on the next birth — so
  // counting litter dropped a weaning as soon as the doe kindled again, and
  // collapsed her repeated weanings into the one surviving row. The archive is
  // append-only, one row per «فطام» press. Mirrors getKitStockSummary.
  const weanedSum = await queryOne<{ total: number }>(
    db,
    "SELECT SUM(weaned) as total FROM weaning_log WHERE weaned IS NOT NULL"
  );
  const movementsSum = await queryAll<{ type: string; total: number }>(
    db,
    "SELECT type, SUM(count) as total FROM kit_stock_movement GROUP BY type"
  );
  let sold = 0, died = 0, retained = 0, adjustment = 0, returned = 0;
  for (const m of movementsSum) {
    if (m.type === "sale") sold = m.total;
    else if (m.type === "death") died = m.total;
    else if (m.type === "retained") retained = m.total;
    else if (m.type === "adjustment") adjustment = m.total;
    else if (m.type === "returned") returned = m.total;
  }
  return (weanedSum?.total ?? 0) - sold - died - retained + adjustment + returned;
}

export async function fetchWeaningSalesPageData(db: SQLiteDBConnection): Promise<{
  ledger: LocalKitLedgerEntry[];
  totalWeaned: number;
  totalSold: number;
  totalDied: number;
  totalRetained: number;
  totalReturned: number;
  totalRevenueCents: number;
  availableStock: number;
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);

  // weaning_log, not litter — see computeAvailableWeanedStock.
  const weanings = await queryAll<{ weaningDate: string; weaned: number }>(
    db,
    "SELECT weaningDate, weaned FROM weaning_log WHERE weaned IS NOT NULL"
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
  for (const l of weanings) {
    const key = l.weaningDate.slice(0, 10);
    const existing = weanedByDay.get(key);
    if (existing) existing.count += l.weaned;
    else weanedByDay.set(key, { date: l.weaningDate, count: l.weaned });
  }

  // نافق and احتفاظ للتربية are recorded one head at a time — each dead kit is
  // its own press, each retained سلالة its own intake — so a day showed as a
  // column of identical −1 rows that had to be counted by eye. Merged per day,
  // the way weanings above already are. بيع/تسوية/مرتجع stay one row per press:
  // each carries its own price, amount or reason, which a sum would erase.
  const MERGED_PER_DAY = new Set(["death", "retained"]);
  const movementRows = movements.map((m) => ({
    key: `move-${m.id}`,
    date: m.date,
    kind: m.type as "sale" | "death" | "retained" | "adjustment" | "returned",
    // Sale/death/retained withdraw from the pool (shown negative); a
    // "returned" سلالة adds back; an adjustment carries its own sign and is
    // shown as stored.
    count: m.type === "adjustment" ? m.count : m.type === "returned" ? m.count : -m.count,
    weightGrams: m.weightGrams,
    pricePerKgCents: m.pricePerKgCents,
    amountCents: m.amountCents,
    notes: m.notes,
    id: m.id as string | undefined,
  }));

  const mergedMovements: LocalKitLedgerEntry[] = [];
  const dayGroups = new Map<string, LocalKitLedgerEntry>();
  for (const row of movementRows) {
    if (!MERGED_PER_DAY.has(row.kind)) {
      mergedMovements.push(row);
      continue;
    }
    const key = `move-day-${row.kind}-${row.date.slice(0, 10)}`;
    const existing = dayGroups.get(key);
    if (!existing) {
      // No id on a merged row: it stands for several movements, so nothing
      // downstream may treat it as one. Notes are kept and joined — they are
      // the only thing these rows carry besides the count.
      dayGroups.set(key, { ...row, key, id: undefined });
      mergedMovements.push(dayGroups.get(key)!);
      continue;
    }
    existing.count += row.count;
    if (row.notes) existing.notes = existing.notes ? `${existing.notes}، ${row.notes}` : row.notes;
  }

  const ledger: LocalKitLedgerEntry[] = [
    ...Array.from(weanedByDay.entries()).map(([key, v]) => ({
      key: `wean-${key}`,
      date: v.date,
      kind: "wean" as const,
      count: v.count,
    })),
    ...mergedMovements,
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
  // سلالات deleted back into the weaning cages — see computeAvailableWeanedStock.
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

/** One نافق نتاج event — see src/app/mortality/kit-deaths.ts for why the two
 * stages come from two different tables and are only merged for display. */
export type LocalKitDeath = {
  id: string;
  date: string;
  stage: "nursing" | "weaned";
  count: number;
  doeId: string | null;
  doeTag: string | null;
  kindlingDate: string | null;
};

/** نافق النتاج (رضاعة + فطام), newest first.
 *
 * No LIMIT on either half: the web log (src/app/mortality/page.tsx) reads the
 * whole table, so a cap here made the same farm show 100 نافق نتاج on the phone
 * against 712 on the web — and the الفطام tab, which totals by day, understated
 * the daily figures rather than just dropping old rows. */
export async function fetchKitDeaths(db: SQLiteDBConnection): Promise<LocalKitDeath[]> {
  const nursing = await queryAll<{
    id: string;
    deathDate: string;
    count: number;
    kindlingDate: string | null;
    doeId: string;
    tagId: string | null;
    retiredTagId: string | null;
  }>(
    db,
    `SELECT k.id, k.deathDate, k.count, k.kindlingDate, k.doeId, r.tagId, r.retiredTagId
       FROM kit_death_log k
       LEFT JOIN rabbit r ON r.id = k.doeId
      ORDER BY k.deathDate DESC`
  );
  const weaned = await queryAll<{ id: string; date: string; count: number }>(
    db,
    "SELECT id, date, count FROM kit_stock_movement WHERE type = 'death' ORDER BY date DESC"
  );

  return [
    ...nursing.map((r) => ({
      id: r.id,
      date: r.deathDate,
      stage: "nursing" as const,
      count: r.count,
      doeId: r.doeId,
      // A doe that has since died had her tag retired so the number could be
      // reused — show the number she carried when the kits were hers.
      doeTag: r.tagId ?? r.retiredTagId,
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
  ].sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchMortalityPageData(db: SQLiteDBConnection): Promise<{
  activeMothers: LocalRabbit[];
  activeBucks: LocalRabbit[];
  activeStock: LocalRabbit[];
  deceasedRabbits: LocalDeceasedRabbit[];
  culledRabbits: LocalDeceasedRabbit[];
  kitDeaths: LocalKitDeath[];
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
    // Uncapped for the same reason as fetchKitDeaths: the النافق log splits
    // these into أمهات/ذكور/سلالات and its counts are read against the web's.
    "SELECT id, tagId, retiredTagId, breed, sex, updatedAt FROM rabbit WHERE status = 'deceased' ORDER BY updatedAt DESC"
  );

  // 4b. Culled rabbits log (استبعاد)
  const culledRabbits = await queryAll<LocalDeceasedRabbit>(
    db,
    "SELECT id, tagId, retiredTagId, breed, sex, updatedAt FROM rabbit WHERE status = 'culled' ORDER BY updatedAt DESC"
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

  // 6. Available stock (shared formula — includes manual adjustments).
  const availableWeanedStock = await computeAvailableWeanedStock(db);

  // 7. نافق النتاج log (both stages)
  const kitDeaths = await fetchKitDeaths(db);

  return { activeMothers, activeBucks, activeStock, deceasedRabbits, culledRabbits, kitDeaths, nursingDoes, availableWeanedStock };
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
  /** Live kits at the ولادة press, frozen — never touched by fostering. */
  bornAliveAtKindling: number;
  /** Stillborn at the ولادة press, frozen. `-1` = row predates the column. */
  bornDeadAtKindling: number;
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

export type DailyKitDeathRow = {
  id: string;
  stage: "nursing" | "weaned";
  count: number;
  doeId: string | null;
  doeTag: string | null;
};

export type DailyLog = {
  matings: DailyMatingRow[];
  pregnancyTests: DailyPregnancyTestRow[];
  nestBoxes: DailyNestBoxRow[];
  kindlings: DailyKindlingRow[];
  weanings: DailyWeaningRow[];
  mortality: DailyMortalityRow[];
  kitDeaths: DailyKitDeathRow[];
};

/**
 * dayIso is a plain "YYYY-MM-DD" string — local dates are stored as ISO TEXT, so a substr(...,1,10) match is a calendar-day filter with no timezone math.
 *
 * Reads the append-only archives (mating_log/kindling_log/weaning_log/
 * nest_box_log), not breeding/litter: those two rows are reused every cycle,
 * markKindled nulls matingDate and overwrites the litter's dates, and markMated
 * clears nestBoxDate — so a past day's page used to lose the very events it
 * records. Mirrors the server's getDailyLog.
 */
export async function fetchDailyPageData(db: SQLiteDBConnection, dayIso: string): Promise<DailyLog> {
  const matingRows = await queryAll<{ id: string; doeId: string; buckId: string | null }>(
    db,
    "SELECT id, doeId, buckId FROM mating_log WHERE substr(matingDate, 1, 10) = ? ORDER BY matingDate DESC",
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
    "SELECT id, doeId FROM nest_box_log WHERE substr(nestBoxDate, 1, 10) = ? ORDER BY nestBoxDate DESC",
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
    bornAliveAtKindling: number | null;
    bornDeadAtKindling: number | null;
  }>(
    db,
    // The frozen pair, like سجل الولادة — see the web getDailyLog for why the
    // mirrored «الرعاية» counts must not drive a past day's record.
    `SELECT id, doeId, buckId, bornAliveAtKindling, bornDeadAtKindling
     FROM kindling_log
     WHERE substr(kindlingDate, 1, 10) = ?
     ORDER BY kindlingDate DESC`,
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
      bornAliveAtKindling: row.bornAliveAtKindling ?? 0,
      // -1 = "predates the column"; kept as-is so it renders «—», not a zero.
      bornDeadAtKindling: row.bornDeadAtKindling ?? -1,
    });
  }

  const weaningRows = await queryAll<{
    id: string;
    doeId: string;
    weaned: number | null;
    weaningWeightGrams: number | null;
  }>(
    db,
    `SELECT id, doeId, weaned, weaningWeightGrams
     FROM weaning_log
     WHERE substr(weaningDate, 1, 10) = ?
     ORDER BY weaningDate DESC`,
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

  // نافق النتاج — the nursing half is kit_death_log, the post-weaning half is
  // the رصيد الفطام ledger itself (kit_stock_movement); see fetchKitDeaths.
  const nursingKitDeaths = await queryAll<{
    id: string;
    count: number;
    doeId: string;
    tagId: string | null;
    retiredTagId: string | null;
  }>(
    db,
    `SELECT k.id, k.count, k.doeId, r.tagId, r.retiredTagId
       FROM kit_death_log k
       LEFT JOIN rabbit r ON r.id = k.doeId
      WHERE substr(k.deathDate, 1, 10) = ?
      ORDER BY k.deathDate DESC`,
    [dayIso]
  );
  const weanedKitDeaths = await queryAll<{ id: string; count: number }>(
    db,
    "SELECT id, count FROM kit_stock_movement WHERE type = 'death' AND substr(date, 1, 10) = ? ORDER BY date DESC",
    [dayIso]
  );

  return {
    matings,
    pregnancyTests,
    nestBoxes,
    kindlings,
    weanings,
    kitDeaths: [
      ...nursingKitDeaths.map((r) => ({
        id: r.id,
        stage: "nursing" as const,
        count: r.count,
        doeId: r.doeId,
        doeTag: r.tagId ?? r.retiredTagId,
      })),
      ...weanedKitDeaths.map((r) => ({
        id: r.id,
        stage: "weaned" as const,
        count: r.count,
        doeId: null,
        doeTag: null,
      })),
    ],
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
  }>(db, "SELECT id, rabbitId, date, type, description, nextDueDate FROM health_record ORDER BY date DESC, createdAt DESC");

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
  /** Ids of recurring-expense postings already booked — see lib/recurring-expenses.ts. */
  postedRecurringIds: string[];
  /** Active does, for reading the fixed monthly cost per doe. */
  doeCount: number;
}> {
  const settings = await getLocalSettings(db);
  const transactions = await queryAll<LocalTransaction>(
    db,
    "SELECT id, date, type, category, amountCents, notes FROM transaction_ledger ORDER BY date DESC, createdAt DESC"
  );
  // Its own query, not a filter over the list above: that one is capped at 200
  // rows, so on a busy farm an older posting would fall off the end and look
  // due again every time the page loaded.
  const posted = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM transaction_ledger WHERE id LIKE 'rec-%'"
  );
  const doeRow = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM rabbit WHERE sex = 'doe' AND status = 'active'"
  );
  return {
    transactions,
    settings,
    postedRecurringIds: posted.map((r) => r.id),
    doeCount: doeRow?.n ?? 0,
  };
}

export type LocalBreed = {
  id: string;
  name: string;
};

export async function fetchSettingsPageData(db: SQLiteDBConnection): Promise<{
  settings: LocalSettings;
  breeds: LocalBreed[];
  /** The multiplier for the feed rations — see fetchHerdComposition. */
  composition: HerdComposition;
 }> {
  const settings = await getLocalSettings(db);
  const breeds = await queryAll<LocalBreed>(db, "SELECT id, name FROM breed ORDER BY name ASC");
  const composition = await fetchHerdComposition(db);
  return { settings, breeds, composition };
}

export async function fetchBreedOptions(db: SQLiteDBConnection): Promise<string[]> {
  const definedBreeds = await queryAll<{ name: string }>(db, "SELECT name FROM breed ORDER BY name ASC");
  const rabbitBreeds = await queryAll<{ breed: string }>(
    db,
    "SELECT DISTINCT breed FROM rabbit WHERE breed IS NOT NULL AND breed != '' ORDER BY breed ASC"
  );

  const set = new Set<string>();
  for (const b of definedBreeds) if (b.name) set.add(b.name);
  for (const r of rabbitBreeds) if (r.breed) set.add(r.breed);

  return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
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

  // SQLite's ORDER BY sorts tagId lexicographically ("1" < "10" < "2"); a
  // natural sort keeps the doe-number order a farmer actually expects.
  does.sort((a, b) => naturalCompare(a.tagId ?? "", b.tagId ?? ""));

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

  // SQLite's ORDER BY sorts tagId lexicographically ("1" < "10" < "2"); a
  // natural sort keeps the buck-number order a farmer actually expects.
  bucks.sort((a, b) => naturalCompare(a.tagId ?? "", b.tagId ?? ""));

  return { bucks, pendingBucks, breedOptions: breeds, settings };
}

export async function fetchStockPageData(db: SQLiteDBConnection): Promise<{
  rabbits: { id: string; sex: string; breed: string | null; cage: string | null; date: string; weightKg: number | null }[];
  breedOptions: string[];
  availableStock: number;
  settings: LocalSettings;
}> {
  const settings = await getLocalSettings(db);
  const breeds = await fetchBreedOptions(db);
  const availableStock = await computeAvailableWeanedStock(db);

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

  return { rabbits, breedOptions: breeds, availableStock, settings };
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
  weightGrams: number | null;
};

export async function fetchRabbitBasic(db: SQLiteDBConnection, id: string): Promise<LocalRabbitBasic | null> {
  const r = await queryOne<Omit<LocalRabbitBasic, "weightGrams">>(
    db,
    "SELECT id, tagId, retiredTagId, breed, color, sex, status, doeState, origin, cage, dateOfBirth, acquiredDate, acquiredFrom, notes FROM rabbit WHERE id = ?",
    [id]
  );
  if (!r) return null;
  const w = await queryOne<{ weightGrams: number }>(
    db,
    "SELECT weightGrams FROM weight_record WHERE rabbitId = ? ORDER BY date DESC, id DESC LIMIT 1",
    [id]
  );
  return { ...r, weightGrams: w?.weightGrams ?? null };
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
  /** «عدد الخلفة» — born alive at the kindling moment, frozen (see the web twin). */
  bornAliveAtKindling: number | null;
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
    // Key by calendar day, not the raw timestamp: a doe is mated at most once
    // per day (a same-day re-mate is forbidden — see markMated), so every log
    // stage of one cycle shares that day even if their snapshotted matingDate
    // strings drift apart by a fraction (two clocks stamp them). Keying on the
    // raw string split such a cycle into two rows — the same mating showing
    // twice in سجل التزاوج.
    const key = dayKey(matingDate);
    let c = cycles.get(key);
    if (!c) {
      c = {
        matingDate,
        buckTagId,
        testDate: null,
        testResult: null,
        kindlingDate: null,
        bornAliveAtKindling: null,
        bornAlive: null,
        bornDead: null,
        weaningDate: null,
        weaned: null,
      };
      cycles.set(key, c);
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

  const kindlings = await queryAll<{
    matingDate: string | null;
    kindlingDate: string;
    buckId: string | null;
    bornAliveAtKindling: number;
  }>(
    db,
    "SELECT matingDate, kindlingDate, buckId, bornAliveAtKindling FROM kindling_log WHERE doeId = ?",
    [doeId]
  );
  for (const row of kindlings) {
    const tag = await buckTag(row.buckId);
    const c = row.matingDate ? ensure(row.matingDate, tag) : ensure(row.kindlingDate, tag);
    c.kindlingDate = row.kindlingDate;
    // Straight off the log row — the litter join below only feeds the live
    // «الرعاية» counts, which fostering and deaths keep moving.
    c.bornAliveAtKindling = row.bornAliveAtKindling;
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
  // Same day-level key, off the permanent archive. A litter row only ever
  // describes the doe's CURRENT cycle — her next kindling resets it (see
  // markKindled) — so for every earlier cycle this is the only surviving
  // record of what was weaned, and the join above finds nothing.
  const weanings = await queryAll<{
    kindlingDate: string | null;
    weaningDate: string;
    bornAlive: number;
    bornDead: number;
    weaned: number | null;
  }>(
    db,
    "SELECT kindlingDate, weaningDate, bornAlive, bornDead, weaned FROM weaning_log WHERE doeId = ?",
    [doeId]
  );
  const weaningByDay = new Map<string, { weaningDate: string; bornAlive: number; bornDead: number; weaned: number | null }>();
  for (const w of weanings) {
    if (!w.kindlingDate) continue;
    weaningByDay.set(dayKey(w.kindlingDate), w);
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
    // Only where the live row had nothing to say: a matched litter is this
    // cycle's own row and stays authoritative.
    const w = weaningByDay.get(dayKey(c.kindlingDate));
    if (w && !c.weaningDate) {
      c.weaningDate = w.weaningDate;
      c.weaned = w.weaned;
      if (c.bornAlive === null) c.bornAlive = w.bornAlive;
      if (c.bornDead === null) c.bornDead = w.bornDead;
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
  /** Frozen birth count — not displayed here, but it's what his متوسط عدد الخلفة averages. */
  bornAliveAtKindling: number | null;
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
    // Key by doe + calendar day, not the raw timestamp: a doe is mated at most
    // once per day, so a cycle's log stages share that day even if their
    // snapshotted matingDate strings drift by a fraction. Keying on the raw
    // string split one mating into two rows here too.
    const key = `${doeId}_${dayKey(matingDate)}`;
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
        bornAliveAtKindling: null,
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

  const kindlings = await queryAll<{
    matingDate: string | null;
    kindlingDate: string;
    doeId: string;
    bornAliveAtKindling: number;
  }>(
    db,
    "SELECT matingDate, kindlingDate, doeId, bornAliveAtKindling FROM kindling_log WHERE buckId = ?",
    [buckId]
  );
  const kindlingKeyByDoeDay = new Map<string, string>();
  for (const row of kindlings) {
    const matingKey = row.matingDate ?? row.kindlingDate;
    const c = await ensure(row.doeId, matingKey);
    c.kindlingDate = row.kindlingDate;
    c.bornAliveAtKindling = row.bornAliveAtKindling;
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

/** Time in السلالات, not weight — mirrors the server's AgeBracket. */
export type AgeBracket = {
  under1m: number;
  m1to2: number;
  m2to3: number;
  over3m: number;
  total: number;
};

export type FollowUpReport = {
  herd: { does: number; bucks: number };
  stock: { males: AgeBracket; females: AgeBracket };
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
  averages: BreedingAverages;
};

/** A "month" is 30 days here — calendar months would make the buckets uneven. */
const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;

/** Weaned-stock ledger balance as of (exclusive) a point in time — running total, not period-bound. */
async function getLocalKitStockBalanceAsOf(db: SQLiteDBConnection, toIso: string): Promise<number> {
  const weanedSum = await queryOne<{ total: number | null }>(
    db,
    // weaning_log, not litter — the litter row is recycled by the next
    // kindling, so summing it drops past weanings out of the running balance
    // and made باقي الفطام read 15 here against 36 on الفطام والبيع. Same
    // source as computeAvailableWeanedStock and the server's
    // getKitStockBalanceAsOf.
    "SELECT SUM(weaned) as total FROM weaning_log WHERE weaningDate < ? AND weaned IS NOT NULL",
    [toIso]
  );
  const movements = await queryAll<{ type: string; total: number }>(
    db,
    "SELECT type, SUM(count) as total FROM kit_stock_movement WHERE date < ? GROUP BY type",
    [toIso]
  );
  let sold = 0, died = 0, retained = 0, returned = 0, adjustment = 0;
  for (const m of movements) {
    if (m.type === "sale") sold = m.total;
    else if (m.type === "death") died = m.total;
    else if (m.type === "retained") retained = m.total;
    else if (m.type === "returned") returned = m.total;
    else if (m.type === "adjustment") adjustment = m.total;
  }
  // Same formula as computeAvailableWeanedStock, just bounded to `toIso` —
  // mirrors the server's getKitStockBalanceAsOf.
  return (weanedSum?.total ?? 0) - sold - died - retained + returned + adjustment;
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

  // Entry date into السلالات, most truthful source first: the "retained" press
  // that moved the kit out of رصيد الفطام, else acquiredDate for bought-in
  // stock (which never passes through the weaning ledger), else createdAt so a
  // row can never drop out. Mirrors the server's enteredStockAt.
  //
  // This replaced a weight-bracket split that could only ever print zeros —
  // replacement stock lives in group cages and is never weighed individually
  // (0 of 41 سلالات on the real farm had a weight row). It also drops the
  // per-rabbit weight lookup that made this an N+1.
  const stockRabbits = await queryAll<{ sex: string; enteredAt: string }>(
    db,
    `SELECT r.sex AS sex,
            COALESCE(m.date, r.acquiredDate, r.createdAt) AS enteredAt
     FROM rabbit r
     LEFT JOIN kit_stock_movement m
       ON m.rabbitId = r.id AND m.type = 'retained'
     WHERE r.tagId IS NULL AND r.status = 'active'`
  );
  const males: AgeBracket = { under1m: 0, m1to2: 0, m2to3: 0, over3m: 0, total: 0 };
  const females: AgeBracket = { under1m: 0, m1to2: 0, m2to3: 0, over3m: 0, total: 0 };
  const now = Date.now();
  for (const r of stockRabbits) {
    const bracket = r.sex === "buck" ? males : r.sex === "doe" ? females : null;
    if (!bracket) continue;
    bracket.total++;
    const days = Math.floor((now - new Date(r.enteredAt).getTime()) / DAY_MS);
    if (days < MONTH_DAYS) bracket.under1m++;
    else if (days < MONTH_DAYS * 2) bracket.m1to2++;
    else if (days < MONTH_DAYS * 3) bracket.m2to3++;
    else bracket.over3m++;
  }

  const [
    weanedStockDeathAgg,
    stockDeaths,
    doeDeaths,
    buckDeaths,
    culls,
    weaningsInRange,
    soldAgg,
    retainedAgg,
    remainingStock,
    matings,
    pregnancyPositive,
    kindlingRows,
  ] = await Promise.all([
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(count) as total FROM kit_stock_movement WHERE type = 'death' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    // Dying retires the number: setRabbitStatus clears tagId and parks it in
    // retiredTagId, so "was this a tagged mother/buck" cannot be asked of tagId
    // alone — `tagId IS NOT NULL AND deceased` matches nothing the app can
    // produce, which put every dead doe and buck in the untagged سلالات bucket
    // and left «نافق الأمهات» and «نافق الذكور» permanently at zero. The
    // mortality page already reads it this way, as does the server (see the
    // matching note in reports/report-data.ts); this is the same test.
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE tagId IS NULL AND retiredTagId IS NULL AND status = 'deceased' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'doe' AND (tagId IS NOT NULL OR retiredTagId IS NOT NULL) AND status = 'deceased' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND (tagId IS NOT NULL OR retiredTagId IS NOT NULL) AND status = 'deceased' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM rabbit WHERE status = 'culled' AND updatedAt >= ? AND updatedAt < ?",
      [fromIso, toIso]
    ),
    // weaning_log, NOT litter: the litter row is recycled by the doe's next
    // kindling, so a weaning whose doe has already re-kindled would vanish from
    // this total. That is exactly what made إجمالي الفطام read 20 here while
    // the الفطام والبيع page — which has always read weaning_log — read 41 off
    // the same database. Same query as the server's weaningsInRange, and it
    // feeds the averages below as well.
    queryAll<AverageWeaningRow>(
      db,
      "SELECT weaned FROM weaning_log WHERE weaningDate >= ? AND weaningDate < ? AND weaned IS NOT NULL",
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
    // Rows, not COUNT(*): the averages need the per-litter counts anyway, and
    // `kindlings` below is just their length.
    queryAll<AverageKindlingRow>(
      db,
      `SELECT bornAliveAtKindling, bornDead, bornDeadAtKindling
       FROM kindling_log WHERE kindlingDate >= ? AND kindlingDate < ?`,
      [fromIso, toIso]
    ),
  ]);

  const totalWeaned = weaningsInRange.reduce((s, l) => s + (l.weaned ?? 0), 0);

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
      kindlings: kindlingRows.length,
    },
    averages: computeBreedingAverages(
      kindlingRows,
      weaningsInRange,
      weanedStockDeathAgg?.total ?? 0,
      remainingStock
    ),
  };
}


/**
 * Local-SQLite equivalent of getHerdReport (src/app/reports/herd-data.ts) for
 * the «إنتاجية القطيع» tab. Feeds the same shared src/lib/herd-productivity.ts
 * used by the web Server Component, so the two can only ever differ in how the
 * rows are fetched — never in what the numbers mean.
 *
 * `toIso` is the EXCLUSIVE upper bound, same contract as fetchFollowUpReport.
 *
 * Every period-bound figure comes from the permanent *_log tables, never from
 * litter/breeding: those rows are recycled by the doe's next kindling, so a
 * herd-level series built on them silently loses every superseded cycle — on a
 * productive farm, nearly all of them.
 */
export async function fetchHerdReport(
  db: SQLiteDBConnection,
  fromIso: string,
  toIso: string
): Promise<HerdReport> {
  const [
    settings,
    doeRows,
    kindlings,
    weanings,
    weanedStockDeathAgg,
    saleAgg,
    incomeAgg,
    expenseAgg,
    feedExpenseAgg,
    lastKindlings,
    firstKindling,
  ] = await Promise.all([
    getLocalSettings(db),
    // The denominator, and the same population the does board shows: tagged
    // and active. A نافقة or مستبعدة doe has left the herd, so charging the
    // farm for her cage would understate every rate below.
    queryAll<{
      id: string;
      tagId: string | null;
      breed: string | null;
      acquiredDate: string | null;
      dateOfBirth: string | null;
      createdAt: string;
    }>(
      db,
      `SELECT id, tagId, breed, acquiredDate, dateOfBirth, createdAt FROM rabbit
       WHERE sex = 'doe' AND tagId IS NOT NULL AND status = 'active' ORDER BY tagId ASC`
    ),
    queryAll<HerdKindlingRow>(
      db,
      `SELECT bornAliveAtKindling, bornAlive, bornDead FROM kindling_log
       WHERE kindlingDate >= ? AND kindlingDate < ?`,
      [fromIso, toIso]
    ),
    queryAll<{ weaned: number | null }>(
      db,
      "SELECT weaned FROM weaning_log WHERE weaningDate >= ? AND weaningDate < ? AND weaned IS NOT NULL",
      [fromIso, toIso]
    ),
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(count) as total FROM kit_stock_movement WHERE type = 'death' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    queryOne<{ count: number | null; grams: number | null; amount: number | null }>(
      db,
      `SELECT SUM(count) as count, SUM(weightGrams) as grams, SUM(amountCents) as amount
         FROM kit_stock_movement
       WHERE type = 'sale' AND date >= ? AND date < ?`,
      [fromIso, toIso]
    ),
    // The ledger, not the sale movements' amountCents: the farm may also sell
    // culled does, bucks, or manure, and every one of those is real income the
    // does' cages helped produce. Kit sales are mirrored into the ledger
    // anyway, so reading it avoids double counting them.
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(amountCents) as total FROM transaction_ledger WHERE type = 'income' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(amountCents) as total FROM transaction_ledger WHERE type = 'expense' AND date >= ? AND date < ?",
      [fromIso, toIso]
    ),
    // Feed alone, so the bill can be turned back into kilograms at the farm's
    // ton price and compared against the meat it produced.
    queryOne<{ total: number | null }>(
      db,
      `SELECT SUM(amountCents) as total FROM transaction_ledger
        WHERE type = 'expense' AND category = 'feed' AND date >= ? AND date < ?`,
      [fromIso, toIso]
    ),
    // Latest kindling per doe over ALL time — deliberately unbounded by the
    // period. "She hasn't kindled in the last week" is meaningless; "she
    // hasn't kindled in 140 days" is a culling decision, and only unbounded
    // history can tell the two apart.
    queryAll<{ doeId: string; lastKindlingDate: string | null }>(
      db,
      "SELECT doeId, MAX(kindlingDate) as lastKindlingDate FROM kindling_log GROUP BY doeId"
    ),
    // The farm's very first kindling — the earliest point at which any of the
    // rates below could have started accruing. See periodDays.
    queryOne<{ firstKindlingDate: string | null }>(
      db,
      "SELECT MIN(kindlingDate) as firstKindlingDate FROM kindling_log"
    ),
  ]);

  const lastByDoe = new Map(lastKindlings.map((r) => [r.doeId, toDate(r.lastKindlingDate)]));

  // Clamped to the window that could actually hold events before it's used as a
  // denominator: «إلغاء التصفية» asks for the whole record, which arrives here as
  // 1970→2999, and annualising over a thousand years printed 0.0 دورة لكل أم on
  // a farm doing perfectly well. Mirrors src/app/reports/herd-data.ts.
  const nowMs = Date.now();
  const firstEventMs = firstKindling?.firstKindlingDate
    ? new Date(firstKindling.firstKindlingDate).getTime()
    : null;
  const fromMs = firstEventMs != null ? Math.max(firstEventMs, new Date(fromIso).getTime()) : new Date(fromIso).getTime();
  const toMs = Math.min(new Date(toIso).getTime(), nowMs);
  const periodDays = Math.max(1, Math.round((toMs - fromMs) / 86_400_000));
  const { cycleDays, targetCyclesPerYear } = rebreedTarget(settings.rebreedAfterKindlingDays);

  const productivity = computeHerdProductivity({
    doeCount: doeRows.length,
    periodDays,
    cycleDays,
    targetCyclesPerYear,
    kindlings,
    weanings,
    weanedStockDeaths: weanedStockDeathAgg?.total ?? 0,
    soldCount: saleAgg?.count ?? 0,
    soldWeightGrams: saleAgg?.grams ?? 0,
    incomeCents: incomeAgg?.total ?? 0,
    expenseCents: expenseAgg?.total ?? 0,
    soldAmountCents: saleAgg?.amount ?? 0,
    feedExpenseCents: feedExpenseAgg?.total ?? 0,
    feedPricePerTonCents: settings.feedPricePerTonCents,
  });

  // Idleness is measured from now, not from the period end: it is a current
  // state ("who is sitting idle in the barn today"), the same way the herd and
  // stock balance cards on the follow-up report are current snapshots.
  const idleDoes = findIdleDoes(
    doeRows.map((d) => ({
      id: d.id,
      tagId: d.tagId,
      breed: d.breed,
      lastKindlingDate: lastByDoe.get(d.id) ?? null,
      enteredHerdAt: toDate(d.acquiredDate) ?? toDate(d.dateOfBirth) ?? new Date(d.createdAt),
    })),
    cycleDays,
    new Date()
  );

  return { productivity, idleDoes, cycleDays, currency: settings.currency };
}

/**
 * The SQLite twin of src/lib/herd-composition.ts — same class mapping, same
 * two judgement calls (a nursing-and-pregnant doe eats as nursing; `bred`
 * counts as empty), so the expected-feed figure on the phone and on the web
 * can only differ in how the rows were counted, never in what they mean.
 *
 * doeState lives on `rabbit`, so this is a plain group-by with no join, and a
 * doe who has never been bred is still counted (as empty, which is what she is).
 */
export async function fetchHerdComposition(
  db: SQLiteDBConnection
): Promise<HerdComposition> {
  const states = await queryAll<{ doeState: string; count: number }>(
    db,
    `SELECT doeState, COUNT(*) as count
       FROM rabbit
      WHERE sex = 'doe' AND status = 'active' AND tagId IS NOT NULL
      GROUP BY doeState`
  );
  const n = (...wanted: string[]) =>
    states.reduce((s, r) => (wanted.includes(r.doeState) ? s + r.count : s), 0);
  const total = states.reduce((s, r) => s + r.count, 0);
  const doesNursing = n("nursing", "nursing_bred", "nursing_pregnant");
  const doesPregnant = n("pregnant");

  const bucks = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status = 'active'"
  );
  const juveniles = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM rabbit WHERE tagId IS NULL AND status = 'active'"
  );
  const growers = await computeAvailableWeanedStock(db);

  return {
    doesIdle: Math.max(0, total - doesNursing - doesPregnant),
    doesPregnant,
    doesNursing,
    bucks: bucks?.count ?? 0,
    growers: Math.max(0, growers),
    juveniles: juveniles?.count ?? 0,
  };
}
