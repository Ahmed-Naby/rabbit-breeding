/**
 * Client-side reimplementation of the branch logic in breeding-ops.ts /
 * rabbit-ops.ts, operating on the local SQLite mirror instead of Prisma —
 * necessarily duplicated (the mobile bundle can't import server-only Prisma
 * code), see the sync plan's Phase 2 section. This is what `outbox.enqueue`
 * calls to make the UI update immediately, before the op has actually
 * reached the server; the server replay (via operation-registry.ts) is the
 * authority, this is only ever a best-effort local guess.
 *
 * Two tables (litter, weight_record) can be *created* by these ops without a
 * client-supplied id, because the server ops that create them
 * (markWeaned/setLitterCount/recordKindling's litter.upsert,
 * createQuickRabbit/saveQuickRabbitWeight's weightRecord.create) don't take
 * one either — Prisma assigns its own cuid() server-side. Locally these get
 * an "local-"-prefixed placeholder id; sync-manager.pull() reconciles it away
 * once the server's real row comes back (see pull.ts's upsert-by-natural-key
 * for both tables).
 *
 * Deliberately NOT mirrored/written here: PregnancyTestLog, KindlingLog,
 * FosterLog, KitStockMovement — all append-only history/reporting tables,
 * not needed for the boards' immediate optimistic feedback, refreshed from
 * the server on the next pull like everything else read-only.
 */
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { createId } from "@paralleldrive/cuid2";
import { queryOne, run, nowIso, todayIso, addDaysIso } from "../db/helpers";
import type { LocalRabbit, LocalBreeding, LocalLitter, LocalSettings } from "../db/types";
import {
  BREEDING_OUTCOMES,
  PREGNANCY_TEST_RESULTS,
  DOE_STATES,
  RABBIT_STATUSES,
  type BreedingOutcome,
  type PregnancyTestResult,
  type DoeState,
  type RabbitStatus,
} from "@/lib/enums";
import { toGrams } from "@/lib/units";

export type LocalOpOutcome = { status: "applied" } | { status: "rejected"; resultMessage: string };

const applied: LocalOpOutcome = { status: "applied" };
function rejected(resultMessage: string): LocalOpOutcome {
  return { status: "rejected", resultMessage };
}

// --- small local readers ---------------------------------------------------

async function getSettings(db: SQLiteDBConnection): Promise<LocalSettings> {
  const row = await queryOne<LocalSettings>(db, "SELECT * FROM settings_cache WHERE id = 1");
  // Falls back to schema.sql's column defaults if a device somehow syncs an
  // op before its first pull has ever populated settings_cache.
  return (
    row ?? {
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
    }
  );
}

function getRabbit(db: SQLiteDBConnection, id: string) {
  return queryOne<LocalRabbit>(db, "SELECT * FROM rabbit WHERE id = ?", [id]);
}

function getBreeding(db: SQLiteDBConnection, id: string) {
  return queryOne<LocalBreeding>(db, "SELECT * FROM breeding WHERE id = ?", [id]);
}

function getLitterByBreeding(db: SQLiteDBConnection, breedingId: string) {
  return queryOne<LocalLitter>(db, "SELECT * FROM litter WHERE breedingId = ?", [breedingId]);
}

/** Mirrors resolveBuckId server-side: a blank tag means "don't record a buck", not an error. */
async function resolveBuckId(db: SQLiteDBConnection, buckTagId?: string): Promise<string | null> {
  const tagId = buckTagId?.trim();
  if (!tagId) return null;
  const buck = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM rabbit WHERE sex = 'buck' AND tagId = ?",
    [tagId]
  );
  return buck?.id ?? null;
}

async function updateRabbit(db: SQLiteDBConnection, id: string, patch: Record<string, unknown>) {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  await run(
    db,
    `UPDATE rabbit SET ${cols.map((c) => `${c} = ?`).join(", ")}, updatedAt = ? WHERE id = ?`,
    [...cols.map((c) => patch[c]), nowIso(), id]
  );
}

async function updateBreeding(db: SQLiteDBConnection, id: string, patch: Record<string, unknown>) {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  await run(
    db,
    `UPDATE breeding SET ${cols.map((c) => `${c} = ?`).join(", ")}, updatedAt = ? WHERE id = ?`,
    [...cols.map((c) => patch[c]), nowIso(), id]
  );
}

/**
 * Upsert-by-breedingId, matching the schema's UNIQUE(breedingId) — lets a
 * server-confirmed row (real id) transparently replace a locally-created
 * placeholder (see file header) without any separate reconciliation pass.
 */
async function upsertLitterByBreedingId(
  db: SQLiteDBConnection,
  breedingId: string,
  create: { id?: string; kindlingDate: string; bornAlive?: number; bornDead?: number; weaned?: number | null; weaningDate?: string | null; weaningWeightGrams?: number | null; notes?: string | null },
  updatePatch: Record<string, unknown>
) {
  const existing = await getLitterByBreeding(db, breedingId);
  const now = nowIso();
  if (!existing) {
    await run(
      db,
      `INSERT INTO litter (id, breedingId, kindlingDate, bornAlive, bornDead, weaned, weaningDate, weaningWeightGrams, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        create.id ?? `local-${createId()}`,
        breedingId,
        create.kindlingDate,
        create.bornAlive ?? 0,
        create.bornDead ?? 0,
        create.weaned ?? null,
        create.weaningDate ?? null,
        create.weaningWeightGrams ?? null,
        create.notes ?? null,
        now,
        now,
      ]
    );
    return;
  }
  const cols = Object.keys(updatePatch).filter((c) => updatePatch[c] !== undefined);
  if (cols.length === 0) return;
  await run(
    db,
    `UPDATE litter SET ${cols.map((c) => `${c} = ?`).join(", ")}, updatedAt = ? WHERE breedingId = ?`,
    [...cols.map((c) => updatePatch[c]), now, breedingId]
  );
}

async function upsertLatestWeightRecord(db: SQLiteDBConnection, rabbitId: string, weightGrams: number, date?: string) {
  const latest = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM weight_record WHERE rabbitId = ? ORDER BY date DESC LIMIT 1",
    [rabbitId]
  );
  const now = nowIso();
  if (latest) {
    await run(db, "UPDATE weight_record SET weightGrams = ?, updatedAt = ? WHERE id = ?", [weightGrams, now, latest.id]);
  } else {
    await run(
      db,
      `INSERT INTO weight_record (id, rabbitId, date, weightGrams, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      [`local-${createId()}`, rabbitId, date ?? now, weightGrams, now, now]
    );
  }
}

// --- ops --------------------------------------------------------------------

export async function startBreeding(
  db: SQLiteDBConnection,
  payload: { doeId: string; buckTagId?: string; id?: string }
): Promise<LocalOpOutcome> {
  const settings = await getSettings(db);
  const matingDate = todayIso();
  const expectedKindlingDate = addDaysIso(matingDate, settings.gestationDays);
  const buckId = await resolveBuckId(db, payload.buckTagId);
  const now = nowIso();

  await run(
    db,
    `INSERT INTO breeding (id, buckId, doeId, matingDate, expectedKindlingDate, actualKindlingDate, nestBoxDate, outcome, pregnancyTestResult, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 'pending', 'pending', NULL, ?, ?)`,
    [payload.id ?? createId(), buckId, payload.doeId, matingDate, expectedKindlingDate, now, now]
  );
  await updateRabbit(db, payload.doeId, { doeState: "bred" });
  return applied;
}

export async function setBreedingOutcome(
  db: SQLiteDBConnection,
  payload: { id: string; outcome: string }
): Promise<LocalOpOutcome> {
  if (!BREEDING_OUTCOMES.includes(payload.outcome as BreedingOutcome)) {
    return rejected(`Invalid outcome: ${payload.outcome}`);
  }
  await updateBreeding(db, payload.id, { outcome: payload.outcome });
  return applied;
}

export async function setPregnancyTestResult(
  db: SQLiteDBConnection,
  payload: { id: string; result: string }
): Promise<LocalOpOutcome> {
  if (!PREGNANCY_TEST_RESULTS.includes(payload.result as PregnancyTestResult)) {
    return rejected(`Invalid pregnancy test result: ${payload.result}`);
  }
  await updateBreeding(db, payload.id, { pregnancyTestResult: payload.result });
  return applied;
}

export async function markMated(
  db: SQLiteDBConnection,
  payload: { breedingId: string; doeId: string; buckTagId?: string; id?: string }
): Promise<LocalOpOutcome> {
  const settings = await getSettings(db);
  const matingDate = todayIso();
  const expectedKindlingDate = addDaysIso(matingDate, settings.gestationDays);
  const buckId = await resolveBuckId(db, payload.buckTagId);
  const doe = await getRabbit(db, payload.doeId);
  const now = nowIso();

  if (doe?.doeState === "nursing") {
    await run(
      db,
      `INSERT INTO breeding (id, buckId, doeId, matingDate, expectedKindlingDate, actualKindlingDate, nestBoxDate, outcome, pregnancyTestResult, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, 'pending', 'pending', NULL, ?, ?)`,
      [payload.id ?? createId(), buckId, payload.doeId, matingDate, expectedKindlingDate, now, now]
    );
    await updateRabbit(db, payload.doeId, { doeState: "nursing_bred" });
  } else {
    await updateBreeding(db, payload.breedingId, {
      matingDate,
      expectedKindlingDate,
      actualKindlingDate: null,
      nestBoxDate: null,
      buckId,
    });
    await updateRabbit(db, payload.doeId, { doeState: "bred" });
  }
  return applied;
}

export async function confirmPregnant(
  db: SQLiteDBConnection,
  payload: { breedingId: string; doeId: string; target: string }
): Promise<LocalOpOutcome> {
  if (!DOE_STATES.includes(payload.target as DoeState)) {
    return rejected(`Invalid doe state: ${payload.target}`);
  }
  const breeding = await getBreeding(db, payload.breedingId);
  if (!breeding?.matingDate) {
    return rejected("Breeding has no mating date to confirm");
  }
  await updateRabbit(db, payload.doeId, { doeState: payload.target });
  return applied;
}

export async function installNestBox(
  db: SQLiteDBConnection,
  payload: { breedingId: string }
): Promise<LocalOpOutcome> {
  await updateBreeding(db, payload.breedingId, { nestBoxDate: todayIso() });
  return applied;
}

export async function markKindled(
  db: SQLiteDBConnection,
  payload: { breedingId: string; doeId: string }
): Promise<LocalOpOutcome> {
  const breeding = await getBreeding(db, payload.breedingId);
  if (!breeding) return rejected("Breeding not found locally");
  if (!breeding.matingDate) return rejected("NO_MATING_DATE");

  const actualKindlingDate = todayIso();
  await updateBreeding(db, payload.breedingId, { matingDate: null, actualKindlingDate });
  const litter = await getLitterByBreeding(db, payload.breedingId);
  if (litter) {
    await run(db, "UPDATE litter SET weaningDate = NULL, updatedAt = ? WHERE breedingId = ?", [nowIso(), payload.breedingId]);
  }
  await updateRabbit(db, payload.doeId, { doeState: "nursing" });
  return applied;
}

export async function markWeaned(
  db: SQLiteDBConnection,
  payload: { breedingId: string; doeId: string }
): Promise<LocalOpOutcome> {
  const breeding = await getBreeding(db, payload.breedingId);
  if (!breeding) return rejected("Breeding not found locally");
  const doe = await getRabbit(db, payload.doeId);
  const weaningDate = todayIso();

  const nextState: DoeState =
    doe?.doeState === "nursing_bred"
      ? "bred"
      : doe?.doeState === "pregnant" || doe?.doeState === "nursing_pregnant"
        ? "pregnant"
        : "empty";

  await upsertLitterByBreedingId(
    db,
    payload.breedingId,
    { kindlingDate: breeding.actualKindlingDate ?? weaningDate, weaningDate },
    { weaningDate }
  );
  await updateRabbit(db, payload.doeId, { doeState: nextState });
  return applied;
}

export async function setLitterCount(
  db: SQLiteDBConnection,
  payload: { breedingId: string; field: "bornAlive" | "bornDead" | "weaned"; value: number | null }
): Promise<LocalOpOutcome> {
  const breeding = await getBreeding(db, payload.breedingId);
  if (!breeding) return rejected("Breeding not found locally");
  const litter = await getLitterByBreeding(db, payload.breedingId);

  const bornAlive = payload.field === "bornAlive" ? (payload.value ?? 0) : undefined;
  const bornDead = payload.field === "bornDead" ? (payload.value ?? 0) : undefined;
  const weaned = payload.field === "weaned" ? payload.value : undefined;

  const effectiveBornAlive = bornAlive ?? litter?.bornAlive ?? 0;
  const effectiveWeaned = payload.field === "weaned" ? payload.value : (litter?.weaned ?? null);
  if (effectiveWeaned !== null && effectiveWeaned !== undefined && effectiveWeaned > effectiveBornAlive) {
    return rejected("WEANED_EXCEEDS_BORN_ALIVE");
  }

  await upsertLitterByBreedingId(
    db,
    payload.breedingId,
    {
      kindlingDate: breeding.actualKindlingDate ?? nowIso(),
      bornAlive: bornAlive ?? 0,
      bornDead: bornDead ?? 0,
      weaned: weaned ?? null,
    },
    { bornAlive, bornDead, weaned }
  );
  return applied;
}

export async function setLitterWeaningWeight(
  db: SQLiteDBConnection,
  payload: { breedingId: string; weaningWeightGrams: number | null }
): Promise<LocalOpOutcome> {
  const { weaningWeightGrams } = payload;
  if (weaningWeightGrams !== null && (!Number.isInteger(weaningWeightGrams) || weaningWeightGrams < 0)) {
    return rejected("INVALID_VALUE");
  }
  const breeding = await getBreeding(db, payload.breedingId);
  if (!breeding) return rejected("Breeding not found locally");

  await upsertLitterByBreedingId(
    db,
    payload.breedingId,
    { kindlingDate: breeding.actualKindlingDate ?? nowIso(), weaningWeightGrams },
    { weaningWeightGrams }
  );
  return applied;
}

export async function recordNursingKitDeath(
  db: SQLiteDBConnection,
  payload: { breedingId: string; count?: number }
): Promise<LocalOpOutcome> {
  const count = payload.count ?? 1;
  const litter = await getLitterByBreeding(db, payload.breedingId);
  if (!litter || litter.bornAlive <= 0 || count < 1 || count > litter.bornAlive) {
    return rejected("NO_NURSING_KITS");
  }
  await run(
    db,
    "UPDATE litter SET bornAlive = bornAlive - ?, bornDead = bornDead + ?, updatedAt = ? WHERE breedingId = ?",
    [count, count, nowIso(), payload.breedingId]
  );
  return applied;
}

export async function markMatingFailed(
  db: SQLiteDBConnection,
  payload: { breedingId: string; doeId: string }
): Promise<LocalOpOutcome> {
  const doe = await getRabbit(db, payload.doeId);
  if (doe?.doeState === "nursing_bred") {
    await run(db, "DELETE FROM breeding WHERE id = ?", [payload.breedingId]);
    await updateRabbit(db, payload.doeId, { doeState: "nursing" });
  } else {
    await updateBreeding(db, payload.breedingId, { matingDate: null, nestBoxDate: null });
    await updateRabbit(db, payload.doeId, { doeState: "empty" });
  }
  return applied;
}

export async function clearDoeRow(
  db: SQLiteDBConnection,
  payload: { breedingId: string; doeId: string }
): Promise<LocalOpOutcome> {
  await run(db, "DELETE FROM litter WHERE breedingId = ?", [payload.breedingId]);
  await updateBreeding(db, payload.breedingId, {
    matingDate: null,
    actualKindlingDate: null,
    nestBoxDate: null,
    buckId: null,
  });
  await updateRabbit(db, payload.doeId, { doeState: "empty" });
  return applied;
}

export async function setMatingDate(
  db: SQLiteDBConnection,
  payload: { breedingId: string; matingDate: string | null }
): Promise<LocalOpOutcome> {
  const patch: Record<string, unknown> = { matingDate: payload.matingDate };
  if (payload.matingDate) {
    const settings = await getSettings(db);
    patch.expectedKindlingDate = addDaysIso(payload.matingDate, settings.gestationDays);
  }
  await updateBreeding(db, payload.breedingId, patch);
  return applied;
}

export async function recordKindling(
  db: SQLiteDBConnection,
  payload: {
    breedingId: string;
    kindlingDate: string;
    bornAlive: number;
    bornDead: number;
    weaned: number | null;
    weaningDate: string | null;
    notes: string | null;
  }
): Promise<LocalOpOutcome> {
  const existing = await getLitterByBreeding(db, payload.breedingId);
  if (existing) return rejected("LITTER_ALREADY_EXISTS");

  const breeding = await getBreeding(db, payload.breedingId);
  if (!breeding) return rejected("Breeding not found locally");
  const doe = await getRabbit(db, breeding.doeId);

  const doeState: DoeState = payload.weaningDate
    ? doe?.doeState === "nursing_bred"
      ? "bred"
      : doe?.doeState === "pregnant" || doe?.doeState === "nursing_pregnant"
        ? "pregnant"
        : "empty"
    : "nursing";

  await upsertLitterByBreedingId(
    db,
    payload.breedingId,
    {
      kindlingDate: payload.kindlingDate,
      bornAlive: payload.bornAlive,
      bornDead: payload.bornDead,
      weaned: payload.weaned,
      weaningDate: payload.weaningDate,
      notes: payload.notes,
    },
    {}
  );
  await updateBreeding(db, payload.breedingId, { outcome: "successful", actualKindlingDate: payload.kindlingDate });
  await updateRabbit(db, breeding.doeId, { doeState });
  return applied;
}

export async function setDoeState(
  db: SQLiteDBConnection,
  payload: { id: string; state: string }
): Promise<LocalOpOutcome> {
  if (!DOE_STATES.includes(payload.state as DoeState)) {
    return rejected(`Invalid doe state: ${payload.state}`);
  }
  await updateRabbit(db, payload.id, { doeState: payload.state });
  return applied;
}

const TAG_RETIRING_STATUSES: Partial<Record<RabbitStatus, string>> = {
  deceased: "نافق",
  culled: "استبعاد",
};

/** Mirrors setRabbitStatusOp's tag-retiring logic (see rabbit-ops.ts) for optimistic local apply. */
export async function setRabbitStatus(
  db: SQLiteDBConnection,
  payload: { id: string; status: string }
): Promise<LocalOpOutcome> {
  if (!RABBIT_STATUSES.includes(payload.status as RabbitStatus)) {
    return rejected(`Invalid status: ${payload.status}`);
  }
  const retireWord = TAG_RETIRING_STATUSES[payload.status as RabbitStatus];
  if (retireWord) {
    const current = await getRabbit(db, payload.id);
    if (current?.tagId) {
      const today = todayIso().slice(0, 10);
      await updateRabbit(db, payload.id, {
        status: payload.status,
        tagId: null,
        retiredTagId: `${current.tagId} (${retireWord} ${today})`,
      });
      return applied;
    }
  }
  await updateRabbit(db, payload.id, { status: payload.status });
  return applied;
}

export async function updateRabbitDetails(
  db: SQLiteDBConnection,
  payload: {
    id: string;
    breed: string | null;
    color: string | null;
    cage: string | null;
    dateOfBirth: string | null;
    acquiredDate: string | null;
    acquiredFrom: string | null;
    notes: string | null;
  }
): Promise<LocalOpOutcome> {
  await updateRabbit(db, payload.id, {
    breed: payload.breed,
    color: payload.color,
    cage: payload.cage,
    dateOfBirth: payload.dateOfBirth,
    acquiredDate: payload.acquiredDate,
    acquiredFrom: payload.acquiredFrom,
    notes: payload.notes,
  });
  return applied;
}

export async function createQuickRabbit(
  db: SQLiteDBConnection,
  payload: { tagId: string | null; breed: string | null; sex: "doe" | "buck"; date: string; weightKg: number | null; id?: string }
): Promise<LocalOpOutcome> {
  if (payload.tagId) {
    const clash = await queryOne<{ id: string }>(db, "SELECT id FROM rabbit WHERE tagId = ? AND sex = ?", [
      payload.tagId,
      payload.sex,
    ]);
    if (clash) return rejected("TAG_IN_USE");
  }

  const id = payload.id ?? createId();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO rabbit (id, tagId, breed, color, sex, dateOfBirth, status, doeState, cage, origin, movedToHerdPen, acquiredDate, acquiredFrom, notes, photoUrl, sireId, damId, litterId, createdAt, updatedAt)
     VALUES (?, ?, ?, NULL, ?, NULL, 'active', 'empty', NULL, 'farm', 0, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    [id, payload.tagId, payload.breed, payload.sex, payload.date, now, now]
  );

  if (payload.weightKg != null) {
    const grams = toGrams({ kg: payload.weightKg }, "kg");
    await upsertLatestWeightRecord(db, id, grams, payload.date);
  }
  return applied;
}

export async function finalizeMother(
  db: SQLiteDBConnection,
  payload: { id: string; tagId: string; weightKg: number }
): Promise<LocalOpOutcome> {
  // Scoped by sex (tagId is only unique per-sex, mirroring the DB's
  // @@unique([tagId, sex])) — otherwise a buck already holding this number
  // would wrongly block a doe (or vice versa) from reusing it.
  const clash = await queryOne<{ id: string }>(
    db,
    `SELECT id FROM rabbit WHERE tagId = ? AND sex = (SELECT sex FROM rabbit WHERE id = ?) AND id != ?`,
    [payload.tagId, payload.id, payload.id]
  );
  if (clash) return rejected("TAG_IN_USE");

  const now = nowIso();
  await run(
    db,
    "UPDATE rabbit SET tagId = ?, acquiredDate = ?, movedToHerdPen = 1, updatedAt = ? WHERE id = ?",
    [payload.tagId, now, now, payload.id]
  );

  const grams = toGrams({ kg: payload.weightKg }, "kg");
  await upsertLatestWeightRecord(db, payload.id, grams);
  return applied;
}

export async function finalizeBuck(
  db: SQLiteDBConnection,
  payload: { id: string; tagId: string; weightKg: number }
): Promise<LocalOpOutcome> {
  return finalizeMother(db, payload);
}

export async function saveQuickRabbitCage(
  db: SQLiteDBConnection,
  payload: { id: string; cage: string }
): Promise<LocalOpOutcome> {
  await updateRabbit(db, payload.id, { cage: payload.cage });
  return applied;
}

export async function saveQuickRabbitWeight(
  db: SQLiteDBConnection,
  payload: { id: string; weightKg: number }
): Promise<LocalOpOutcome> {
  const grams = toGrams({ kg: payload.weightKg }, "kg");
  await upsertLatestWeightRecord(db, payload.id, grams);
  return applied;
}

export async function promoteToHerdPen(
  db: SQLiteDBConnection,
  payload: { id: string }
): Promise<LocalOpOutcome> {
  const rabbit = await getRabbit(db, payload.id);
  if (!rabbit) return rejected("NOT_FOUND");
  if (!rabbit.cage) return rejected("CAGE_REQUIRED");
  const weightCount = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) as n FROM weight_record WHERE rabbitId = ?",
    [payload.id]
  );
  if (!weightCount || weightCount.n === 0) return rejected("WEIGHT_REQUIRED");

  await updateRabbit(db, payload.id, { movedToHerdPen: 1 });
  return applied;
}

export const localOpRegistry: Record<
  string,
  (db: SQLiteDBConnection, payload: Record<string, unknown>) => Promise<LocalOpOutcome>
> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startBreeding: startBreeding as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setBreedingOutcome: setBreedingOutcome as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setPregnancyTestResult: setPregnancyTestResult as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markMated: markMated as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmPregnant: confirmPregnant as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  installNestBox: installNestBox as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markKindled: markKindled as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markWeaned: markWeaned as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setLitterCount: setLitterCount as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setLitterWeaningWeight: setLitterWeaningWeight as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordNursingKitDeath: recordNursingKitDeath as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markMatingFailed: markMatingFailed as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clearDoeRow: clearDoeRow as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMatingDate: setMatingDate as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordKindling: recordKindling as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoeState: setDoeState as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRabbitStatus: setRabbitStatus as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateRabbitDetails: updateRabbitDetails as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createQuickRabbit: createQuickRabbit as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalizeMother: finalizeMother as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalizeBuck: finalizeBuck as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteRabbit: deleteRabbit as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveQuickRabbitCage: saveQuickRabbitCage as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveQuickRabbitWeight: saveQuickRabbitWeight as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  promoteToHerdPen: promoteToHerdPen as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transferKits: transferKits as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordKitSale: recordKitSale as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordWeanedKitDeath: recordWeanedKitDeath as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteKitStockMovement: deleteKitStockMovement as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createHealthRecord: createHealthRecord as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteHealthRecord: deleteHealthRecord as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createTransaction: createTransaction as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteTransaction: deleteTransaction as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateSettings: updateSettings as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addBreed: addBreed as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteBreed: deleteBreed as any,
};

export async function transferKits(
  db: SQLiteDBConnection,
  payload: { fromTagId: string; toTagId: string; count: number }
): Promise<LocalOpOutcome> {
  const fromDoe = await queryOne<{ id: string; doeState: string }>(db, "SELECT id, doeState FROM rabbit WHERE tagId = ?", [payload.fromTagId]);
  const toDoe = await queryOne<{ id: string; doeState: string }>(db, "SELECT id, doeState FROM rabbit WHERE tagId = ?", [payload.toTagId]);
  if (!fromDoe) return rejected(`Source doe tag "${payload.fromTagId}" not found`);
  if (!toDoe) return rejected(`Target doe tag "${payload.toTagId}" not found`);

  const fromBreeding = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM breeding WHERE doeId = ? AND actualKindlingDate IS NOT NULL ORDER BY createdAt DESC LIMIT 1",
    [fromDoe.id]
  );
  const toBreeding = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM breeding WHERE doeId = ? AND actualKindlingDate IS NOT NULL ORDER BY createdAt DESC LIMIT 1",
    [toDoe.id]
  );
  if (!fromBreeding) return rejected("Source doe has no active litter");
  if (!toBreeding) return rejected("Target doe has no active litter");

  const fromLitter = await queryOne<{ bornAlive: number }>(
    db,
    "SELECT bornAlive FROM litter WHERE breedingId = ?",
    [fromBreeding.id]
  );
  const toLitter = await queryOne<{ bornAlive: number }>(
    db,
    "SELECT bornAlive FROM litter WHERE breedingId = ?",
    [toBreeding.id]
  );
  if (!fromLitter) return rejected("Source doe has no active litter row");
  if (!toLitter) return rejected("Target doe has no active litter row");

  if (fromLitter.bornAlive < payload.count) {
    return rejected(`Not enough kits in source litter (available: ${fromLitter.bornAlive})`);
  }

  const now = nowIso();
  await run(db, "UPDATE litter SET bornAlive = bornAlive - ?, updatedAt = ? WHERE breedingId = ?", [payload.count, now, fromBreeding.id]);
  await run(db, "UPDATE litter SET bornAlive = bornAlive + ?, updatedAt = ? WHERE breedingId = ?", [payload.count, now, toBreeding.id]);
  await run(
    db,
    "INSERT INTO foster_log (id, fromDoeId, toDoeId, count, date, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [`local-${createId()}`, fromDoe.id, toDoe.id, payload.count, todayIso(), now, now]
  );

  return applied;
}

export async function recordKitSale(
  db: SQLiteDBConnection,
  payload: { date: string; count: number; weightKg: number | null; pricePerKg: number | null; notes: string | null }
): Promise<LocalOpOutcome> {
  const now = nowIso();
  const date = payload.date;
  const weightGrams = payload.weightKg != null ? toGrams({ kg: payload.weightKg }, "kg") : null;
  const pricePerKgCents = payload.pricePerKg != null ? Math.round(payload.pricePerKg * 100) : null;
  const amountCents = (weightGrams != null && pricePerKgCents != null) ? Math.round((weightGrams * pricePerKgCents) / 1000) : null;

  await run(
    db,
    `INSERT INTO kit_stock_movement (id, date, type, count, weightGrams, pricePerKgCents, amountCents, transactionId, rabbitId, notes, createdAt, updatedAt)
     VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [`local-${createId()}`, date, payload.count, weightGrams, pricePerKgCents, amountCents, `local-${createId()}`, payload.notes ?? null, now, now]
  );
  return applied;
}

export async function recordWeanedKitDeath(
  db: SQLiteDBConnection,
  payload: { count: number; date?: string; notes?: string | null }
): Promise<LocalOpOutcome> {
  const now = nowIso();
  const date = payload.date ?? todayIso();
  await run(
    db,
    `INSERT INTO kit_stock_movement (id, date, type, count, weightGrams, pricePerKgCents, amountCents, transactionId, rabbitId, notes, createdAt, updatedAt)
     VALUES (?, ?, 'death', ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
    [`local-${createId()}`, date, payload.count, payload.notes ?? null, now, now]
  );
  return applied;
}

export async function deleteKitStockMovement(
  db: SQLiteDBConnection,
  payload: { id: string }
): Promise<LocalOpOutcome> {
  await run(db, "DELETE FROM kit_stock_movement WHERE id = ?", [payload.id]);
  return applied;
}

export async function createHealthRecord(
  db: SQLiteDBConnection,
  payload: { rabbitId: string; date: string; type: string; description: string; nextDueDate?: string | null }
): Promise<LocalOpOutcome> {
  const now = nowIso();
  await run(
    db,
    `INSERT INTO health_record (id, rabbitId, date, type, description, nextDueDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [`local-${createId()}`, payload.rabbitId, payload.date, payload.type, payload.description, payload.nextDueDate ?? null, now, now]
  );
  return applied;
}

export async function deleteHealthRecord(
  db: SQLiteDBConnection,
  payload: { id: string }
): Promise<LocalOpOutcome> {
  await run(db, "DELETE FROM health_record WHERE id = ?", [payload.id]);
  return applied;
}

export async function createTransaction(
  db: SQLiteDBConnection,
  payload: { date: string; type: string; category: string; amountCents: number; notes?: string | null }
): Promise<LocalOpOutcome> {
  const now = nowIso();
  await run(
    db,
    `INSERT INTO transaction_ledger (id, date, type, category, amountCents, notes, rabbitId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [`local-${createId()}`, payload.date, payload.type, payload.category, payload.amountCents, payload.notes ?? null, now, now]
  );
  return applied;
}

export async function deleteTransaction(
  db: SQLiteDBConnection,
  payload: { id: string }
): Promise<LocalOpOutcome> {
  await run(db, "DELETE FROM transaction_ledger WHERE id = ?", [payload.id]);
  return applied;
}

export async function updateSettings(
  db: SQLiteDBConnection,
  payload: Record<string, any>
): Promise<LocalOpOutcome> {
  await run(
    db,
    `INSERT INTO settings_cache (id, weightUnit, gestationDays, gestationWindowDays, pregnancyTestDays, weaningDays, nestBoxDays, matingWeightGrams, rebreedAfterKindlingDays, currency)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       weightUnit = excluded.weightUnit, gestationDays = excluded.gestationDays,
       gestationWindowDays = excluded.gestationWindowDays, pregnancyTestDays = excluded.pregnancyTestDays,
       weaningDays = excluded.weaningDays, nestBoxDays = excluded.nestBoxDays,
       matingWeightGrams = excluded.matingWeightGrams, rebreedAfterKindlingDays = excluded.rebreedAfterKindlingDays,
       currency = excluded.currency`,
    [
      payload.weightUnit ?? 'kg',
      payload.gestationDays ?? 31,
      payload.gestationWindowDays ?? 3,
      payload.pregnancyTestDays ?? 10,
      payload.weaningDays ?? 28,
      payload.nestBoxDays ?? 27,
      payload.matingWeightGrams ?? 3000,
      payload.rebreedAfterKindlingDays ?? 0,
      payload.currency ?? 'USD'
    ]
  );
  return applied;
}

export async function addBreed(
  db: SQLiteDBConnection,
  payload: { name: string }
): Promise<LocalOpOutcome> {
  await run(db, "INSERT OR IGNORE INTO breed (id, name, createdAt) VALUES (?, ?, ?)", [
    `local-${createId()}`,
    payload.name,
    nowIso()
  ]);
  return applied;
}

export async function deleteBreed(
  db: SQLiteDBConnection,
  payload: { id: string }
): Promise<LocalOpOutcome> {
  await run(db, "DELETE FROM breed WHERE id = ?", [payload.id]);
  return applied;
}

export async function deleteRabbit(
  db: SQLiteDBConnection,
  payload: { id: string }
): Promise<LocalOpOutcome> {
  const doeRef = await queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM breeding WHERE doeId = ?", [payload.id]);
  const buckRef = await queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM breeding WHERE buckId = ?", [payload.id]);
  if ((doeRef && doeRef.n > 0) || (buckRef && buckRef.n > 0)) {
    return rejected("DELETE_BLOCKED_BY_BREEDING");
  }

  await run(db, "DELETE FROM weight_record WHERE rabbitId = ?", [payload.id]);
  await run(db, "DELETE FROM rabbit WHERE id = ?", [payload.id]);
  return applied;
}
