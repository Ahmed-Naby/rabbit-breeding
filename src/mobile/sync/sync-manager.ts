/**
 * Foreground + network-online orchestration: pull() then push(), per the
 * sync plan's stated order (pull first so push's optimistic-vs-server
 * reconciliation below has the latest state to compare against). Phase 3's
 * app shell is expected to call `syncNow()` on mount/resume and whenever
 * `@capacitor/network`'s status flips to connected; this file only exposes
 * the mechanism; the app-shell/App-state-change wiring is out of Phase 2's
 * "background sync only, no UI port yet" scope.
 */
import { Network } from "@capacitor/network";
import { App } from "@capacitor/app";
import { getDb, withTransaction, sqlite, dbName } from "../db/client";
import { Capacitor } from "@capacitor/core";
import { queryAll, queryOne, run, nowIso } from "../db/helpers";
import { SYNC_API_BASE_URL, SYNC_SHARED_SECRET } from "../config";
import { getSession } from "../auth";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { createId } from "@paralleldrive/cuid2";

const PUSH_BATCH_SIZE = 25;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;
// Pulls are cheap (delta-only, since-cursor) so a foreground timer is fine
// on a metered connection; paused while backgrounded (see attachAppLifecycleSync)
// so it never runs, or drains data/battery, while the app isn't in use.
const PERIODIC_SYNC_INTERVAL_MS = 30 * 60_000;
// Android's "appStateChange" resume event fires on more than app-switching —
// screen lock/unlock, the notification shade, permission dialogs — so a
// resume-triggered sync is skipped if the last one finished more recently
// than this, instead of stacking on top of the periodic timer.
const MIN_RESUME_SYNC_GAP_MS = 90_000;

// --- status store -------------------------------------------------------

export type SyncStatus = "offline" | "idle" | "syncing" | "error";

export type SyncState = {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

let state: SyncState = { status: "idle", pendingCount: 0, lastSyncAt: null, lastError: null };
const listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

/** Returns an unsubscribe function. Immediately invoked once with current state. */
export function subscribeSyncStatus(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncState {
  return state;
}

async function refreshPendingCount(db: SQLiteDBConnection) {
  const row = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) as n FROM outbox WHERE status IN ('pending', 'syncing')"
  );
  setState({ pendingCount: row?.n ?? 0 });
}

// --- fetch helper ---------------------------------------------------------

export async function syncFetch(path: string, init?: RequestInit): Promise<unknown> {
  // Logged-in devices authenticate with their Bearer token + explicit farm;
  // a device that predates login (or logged out mid-transition) falls back
  // to the legacy shared secret, which the server maps to the default farm.
  const session = getSession();
  const authHeaders: Record<string, string> = session
    ? { authorization: `Bearer ${session.token}`, "x-farm-id": session.activeFarmId }
    : { "x-sync-key": SYNC_SHARED_SECRET };

  const res = await fetch(`${SYNC_API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 && session) {
      const { logout } = await import("../auth");
      await logout().catch(() => {});
      if (typeof window !== "undefined") window.location.reload();
      throw new Error("INVALID_TOKEN");
    }
    let text = await res.text().catch(() => "");
    if (text.includes("<html") || text.includes("<!DOCTYPE")) {
      text = "HTML response received instead of JSON. Your Vercel deployment might have 'Deployment Protection' enabled.";
    }
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// --- device/cursor bookkeeping ---------------------------------------------

type CursorRow = {
  id: 1;
  deviceId: string;
  since: string | null;
  lastSyncAt: string | null;
  lastResetAt: string | null;
  mirrorRefreshV: number | null;
};

// Bump this when the mirror needs a one-time rebuild from the server (see
// the pull() check below). v1: mirrors provisioned before tombstone-based
// delete propagation existed accumulated phantom rows — copies of records
// hard-deleted server-side that no incremental pull could ever remove.
const MIRROR_REFRESH_VERSION = 1;

async function getOrInitCursor(db: SQLiteDBConnection): Promise<CursorRow> {
  const existing = await queryOne<CursorRow>(db, "SELECT * FROM sync_cursor WHERE id = 1");
  if (existing) return existing;

  const deviceId = createId();
  // A fresh device has nothing to purge — stamp it current so the
  // MIRROR_REFRESH_VERSION check in pull() only ever fires on mirrors that
  // predate the bump.
  await run(
    db,
    "INSERT INTO sync_cursor (id, deviceId, since, lastSyncAt, mirrorRefreshV) VALUES (1, ?, NULL, NULL, ?)",
    [deviceId, MIRROR_REFRESH_VERSION]
  );
  return { id: 1, deviceId, since: null, lastSyncAt: null, lastResetAt: null, mirrorRefreshV: MIRROR_REFRESH_VERSION };
}

/**
 * Wipes every local table except sync_cursor (the deviceId and the
 * resetAt/since bookkeeping this same call is about to overwrite live
 * there) — used when pull() detects the server's Settings.dataResetAt has
 * moved past what this device last saw, meaning the online database was
 * wiped and this device's mirror (and any queued-but-unsynced outbox ops,
 * which would now reference rows that no longer exist server-side) needs
 * to be discarded rather than incrementally merged.
 */
async function wipeLocalMirror(): Promise<void> {
  await withTransaction(async (db) => {
    const tables = await queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('android_metadata', 'sync_cursor')"
    );
    for (const { name } of tables) {
      await run(db, `DELETE FROM "${name}"`);
    }
  });
}

/**
 * One-time self-heal (per MIRROR_REFRESH_VERSION bump): wipes the mirrored
 * server tables and resets the pull cursor so the next fetch is a full
 * bootstrap — the only way to evict phantom rows that accumulated before
 * tombstone-based delete propagation existed, since no incremental pull can
 * name a row the server no longer has. Unlike wipeLocalMirror, the outbox
 * survives: queued-but-unsynced operations are real user data and must
 * never be discarded over what is purely a mirror-hygiene rebuild. (Their
 * optimistic local effects are lost with the mirror, but syncNow's
 * pull→push→pull cycle replays them server-side and pulls the result right
 * back.)
 */
async function refreshMirrorTables(): Promise<void> {
  await withTransaction(async (db) => {
    const tables = await queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('android_metadata', 'sync_cursor', 'outbox')"
    );
    for (const { name } of tables) {
      await run(db, `DELETE FROM "${name}"`);
    }
    await run(db, "UPDATE sync_cursor SET since = NULL, mirrorRefreshV = ? WHERE id = 1", [
      MIRROR_REFRESH_VERSION,
    ]);
  });
}

// --- pull --------------------------------------------------------------

type PullResponse = {
  serverTime: string;
  settings: Record<string, unknown> | null;
  rabbits: Record<string, unknown>[];
  breedings: Record<string, unknown>[];
  litters: Record<string, unknown>[];
  weightRecords: Record<string, unknown>[];
  fosterLogs?: Record<string, unknown>[];
  kitStockMovements?: Record<string, unknown>[];
  healthRecords?: Record<string, unknown>[];
  transactions?: Record<string, unknown>[];
  breeds?: Record<string, unknown>[];
  pregnancyTestLogs?: Record<string, unknown>[];
  kindlingLogs?: Record<string, unknown>[];
  weaningLogs?: Record<string, unknown>[];
  matingLogs?: Record<string, unknown>[];
  tombstones?: { id: string; model: string; recordId: string; deletedAt: string }[];
};

// Maps a SyncTombstone's `model` to the local statement(s) that remove it
// (and, where the server's schema cascades on delete, its dependents too —
// see prisma/schema.prisma's onDelete: Cascade on HealthRecord/WeightRecord/
// Litter — so a device that never re-fetches those rows doesn't keep an
// orphaned copy after the parent they reference is gone). "breed" is
// deliberately absent: the breeds loop below already re-derives the whole
// table every pull, so it never needs a tombstone.
const TOMBSTONE_CLEANUP: Record<string, (recordId: string) => { statement: string; values?: unknown[] }[]> = {
  rabbit: (id) => [
    { statement: "DELETE FROM health_record WHERE rabbitId = ?", values: [id] },
    { statement: "DELETE FROM weight_record WHERE rabbitId = ?", values: [id] },
    { statement: "DELETE FROM kit_stock_movement WHERE rabbitId = ?", values: [id] },
    { statement: "DELETE FROM rabbit WHERE id = ?", values: [id] },
  ],
  breeding: (id) => [
    { statement: "DELETE FROM litter WHERE breedingId = ?", values: [id] },
    { statement: "DELETE FROM breeding WHERE id = ?", values: [id] },
  ],
  litter: (id) => [{ statement: "DELETE FROM litter WHERE id = ?", values: [id] }],
  kit_stock_movement: (id) => [{ statement: "DELETE FROM kit_stock_movement WHERE id = ?", values: [id] }],
  transaction_ledger: (id) => [{ statement: "DELETE FROM transaction_ledger WHERE id = ?", values: [id] }],
  health_record: (id) => [{ statement: "DELETE FROM health_record WHERE id = ?", values: [id] }],
};

export async function pull(): Promise<boolean> {
  const db = await getDb();
  const cursor = await getOrInitCursor(db);

  if ((cursor.mirrorRefreshV ?? 0) < MIRROR_REFRESH_VERSION) {
    await refreshMirrorTables();
    cursor.since = null;
  }

  const cb = Date.now();
  const path = cursor.since
    ? `/api/sync/pull?since=${encodeURIComponent(cursor.since)}&_cb=${cb}`
    : `/api/sync/bootstrap?_cb=${cb}`;
  let data = (await syncFetch(path)) as PullResponse;

  let serverResetAt = (data.settings?.dataResetAt as string | null | undefined) ?? null;
  if (serverResetAt && serverResetAt !== cursor.lastResetAt) {
    // The online database was wiped since our last sync (Danger Zone's
    // "wipe online database" action) — this device's mirror, and any
    // outbox ops queued against rows that no longer exist server-side, are
    // stale. Discard everything locally and re-fetch fresh via a full
    // bootstrap rather than trying to merge whatever partial delta we just got.
    await wipeLocalMirror();
    data = (await syncFetch(`/api/sync/bootstrap?_cb=${Date.now()}`)) as PullResponse;
    serverResetAt = (data.settings?.dataResetAt as string | null | undefined) ?? null;
  }

  const set: { statement: string; values?: any[] }[] = [];

  // Deletes first: a row that was updated and then deleted within the same
  // pull window must end up gone, not resurrected by the insert loops below.
  if (data.tombstones) {
    for (const t of data.tombstones) {
      const cleanup = TOMBSTONE_CLEANUP[t.model];
      if (cleanup) set.push(...cleanup(t.recordId));
    }
  }

  if (data.settings) {
    const s = data.settings;
    set.push({
      statement: `INSERT INTO settings_cache (id, weightUnit, gestationDays, gestationWindowDays, pregnancyTestDays, palpationCheckDays, weaningDays, nestBoxDays, matingWeightGrams, rebreedAfterKindlingDays, currency)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         weightUnit = excluded.weightUnit, gestationDays = excluded.gestationDays,
         gestationWindowDays = excluded.gestationWindowDays, pregnancyTestDays = excluded.pregnancyTestDays,
         palpationCheckDays = excluded.palpationCheckDays,
         weaningDays = excluded.weaningDays, nestBoxDays = excluded.nestBoxDays,
         matingWeightGrams = excluded.matingWeightGrams, rebreedAfterKindlingDays = excluded.rebreedAfterKindlingDays,
         currency = excluded.currency`,
      values: [
        s.weightUnit,
        s.gestationDays,
        s.gestationWindowDays,
        s.pregnancyTestDays,
        s.palpationCheckDays,
        s.weaningDays,
        s.nestBoxDays,
        s.matingWeightGrams,
        s.rebreedAfterKindlingDays,
        s.currency,
      ],
    });
  }

  for (const r of data.rabbits) {
    set.push({
      // Use a smart UPSERT instead of INSERT OR REPLACE so that locally-edited
      // fields (tagId, breed, color, cage, etc.) are not blindly overwritten
      // by a stale server pull when the local row is newer.
      statement: `INSERT INTO rabbit (id, tagId, retiredTagId, breed, color, sex, dateOfBirth, status, doeState, cage, origin, movedToHerdPen, acquiredDate, acquiredFrom, notes, photoUrl, sireId, damId, litterId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         tagId        = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.tagId        ELSE rabbit.tagId        END,
         retiredTagId = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.retiredTagId ELSE rabbit.retiredTagId END,
         breed        = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.breed        ELSE rabbit.breed        END,
         color        = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.color        ELSE rabbit.color        END,
         cage         = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.cage         ELSE rabbit.cage         END,
         status       = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.status       ELSE rabbit.status       END,
         doeState     = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.doeState     ELSE rabbit.doeState     END,
         dateOfBirth  = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.dateOfBirth  ELSE rabbit.dateOfBirth  END,
         acquiredDate = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.acquiredDate ELSE rabbit.acquiredDate END,
         acquiredFrom = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.acquiredFrom ELSE rabbit.acquiredFrom END,
         notes        = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.notes        ELSE rabbit.notes        END,
         photoUrl     = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.photoUrl     ELSE rabbit.photoUrl     END,
         movedToHerdPen = CASE WHEN excluded.updatedAt >= rabbit.updatedAt THEN excluded.movedToHerdPen ELSE rabbit.movedToHerdPen END,
         updatedAt    = MAX(excluded.updatedAt, rabbit.updatedAt)`,
      values: [
        r.id, r.tagId, r.retiredTagId, r.breed, r.color, r.sex, r.dateOfBirth, r.status, r.doeState, r.cage, r.origin,
        r.movedToHerdPen ? 1 : 0, r.acquiredDate, r.acquiredFrom, r.notes, r.photoUrl, r.sireId, r.damId,
        r.litterId, r.createdAt, r.updatedAt,
      ],
    });
  }

  for (const b of data.breedings) {
    set.push({
      statement: `INSERT OR REPLACE INTO breeding (id, buckId, doeId, matingDate, expectedKindlingDate, actualKindlingDate, nestBoxDate, outcome, pregnancyTestResult, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        b.id, b.buckId, b.doeId, b.matingDate, b.expectedKindlingDate, b.actualKindlingDate, b.nestBoxDate,
        b.outcome, b.pregnancyTestResult, b.notes, b.createdAt, b.updatedAt,
      ],
    });
  }

  for (const l of data.litters) {
    set.push({
      statement: `INSERT INTO litter (id, breedingId, kindlingDate, bornAlive, bornDead, weaned, weaningDate, weaningWeightGrams, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(breedingId) DO UPDATE SET
         id = excluded.id, kindlingDate = excluded.kindlingDate, bornAlive = excluded.bornAlive,
         bornDead = excluded.bornDead, weaned = excluded.weaned, weaningDate = excluded.weaningDate,
         weaningWeightGrams = excluded.weaningWeightGrams, notes = excluded.notes, updatedAt = excluded.updatedAt`,
      values: [
        l.id, l.breedingId, l.kindlingDate, l.bornAlive, l.bornDead, l.weaned, l.weaningDate,
        l.weaningWeightGrams, l.notes, l.createdAt, l.updatedAt,
      ],
    });
  }

  for (const w of data.weightRecords) {
    set.push({
      statement: "DELETE FROM weight_record WHERE id LIKE 'local-%' AND rabbitId = ? AND date = ?",
      values: [w.rabbitId, w.date],
    });
    set.push({
      statement: `INSERT OR REPLACE INTO weight_record (id, rabbitId, date, weightGrams, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      values: [w.id, w.rabbitId, w.date, w.weightGrams, w.notes, w.createdAt, w.updatedAt],
    });
  }

  if (data.fosterLogs) {
    for (const f of data.fosterLogs) {
      set.push({
        statement: `INSERT OR REPLACE INTO foster_log (id, fromDoeId, toDoeId, count, date, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values: [f.id, f.fromDoeId, f.toDoeId, f.count, f.date, f.createdAt, f.updatedAt ?? f.createdAt],
      });
    }
  }

  if (data.kitStockMovements) {
    for (const m of data.kitStockMovements) {
      set.push({
        statement: "DELETE FROM kit_stock_movement WHERE id = ? OR (id LIKE 'local-%' AND type = ? AND date = ? AND count = ?)",
        values: [m.id, m.type, m.date, m.count],
      });
      set.push({
        statement: `INSERT OR REPLACE INTO kit_stock_movement (id, date, type, count, weightGrams, pricePerKgCents, amountCents, transactionId, rabbitId, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          m.id, m.date, m.type, m.count, m.weightGrams, m.pricePerKgCents, m.amountCents,
          m.transactionId, m.rabbitId, m.notes, m.createdAt, m.updatedAt ?? m.createdAt,
        ],
      });
    }
  }

  if (data.healthRecords) {
    for (const h of data.healthRecords) {
      set.push({
        statement: "DELETE FROM health_record WHERE id = ? OR (id LIKE 'local-%' AND rabbitId = ? AND date = ? AND type = ?)",
        values: [h.id, h.rabbitId, h.date, h.type],
      });
      set.push({
        statement: `INSERT OR REPLACE INTO health_record (id, rabbitId, date, type, description, nextDueDate, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          h.id, h.rabbitId, h.date, h.type, h.description, h.nextDueDate,
          h.createdAt, h.updatedAt ?? h.createdAt,
        ],
      });
    }
  }

  if (data.transactions) {
    for (const t of data.transactions) {
      set.push({
        statement: "DELETE FROM transaction_ledger WHERE id = ? OR (id LIKE 'local-%' AND date = ? AND type = ? AND category = ? AND amountCents = ?)",
        values: [t.id, t.date, t.type, t.category, t.amountCents],
      });
      set.push({
        statement: `INSERT OR REPLACE INTO transaction_ledger (id, date, type, category, amountCents, notes, rabbitId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          t.id, t.date, t.type, t.category, t.amountCents, t.notes, t.rabbitId,
          t.createdAt, t.updatedAt ?? t.createdAt,
        ],
      });
    }
  }

  if (data.breeds) {
    // Server always returns the *full* breed list (see runPull's unfiltered
    // findMany), so this used to be a blanket "DELETE FROM breed" + reinsert
    // to also propagate deletions/renames from other devices. But pull()
    // runs before push() in syncNow(), so a breed just added on this device
    // (local-ops.ts's addBreed, optimistically inserted under a
    // "local-<cuid>" placeholder id) hadn't reached the server yet, and the
    // blanket delete wiped it out of the local list — a visible
    // appears-then-disappears flicker — before the very next push() could
    // land it. Scope the delete to already-synced rows only, and reconcile
    // each placeholder by name once its authoritative counterpart shows up,
    // mirroring applyPulledWeightRecord's local-% cleanup above.
    set.push({ statement: "DELETE FROM breed WHERE id NOT LIKE 'local-%'", values: [] });
    for (const b of data.breeds) {
      // Placeholder cleanup runs BEFORE the insert (same order as
      // applyPulledWeightRecord above) so that even a server id that
      // itself matches the placeholder pattern can never delete the row
      // it just arrived as.
      set.push({
        statement: "DELETE FROM breed WHERE id LIKE 'local-%' AND name = ?",
        values: [b.name],
      });
      set.push({
        statement: "INSERT OR REPLACE INTO breed (id, name, createdAt) VALUES (?, ?, ?)",
        values: [b.id, b.name, b.createdAt],
      });
    }
  }

  if (data.pregnancyTestLogs) {
    for (const log of data.pregnancyTestLogs) {
      // Drop the optimistic placeholder this device wrote for the same test
      // (local-ops' insertPregnancyTestLog) before inserting the server's
      // authoritative row — they carry different ids, so without this the
      // same test would sit in سجل الجس twice. doeId + matingDate + result
      // identifies it: testDate can't, since the two clocks stamp it apart.
      set.push({
        statement:
          "DELETE FROM pregnancy_test_log WHERE id LIKE 'local-%' AND doeId = ? AND matingDate = ? AND result = ?",
        values: [log.doeId, log.matingDate, log.result],
      });
      set.push({
        statement: `INSERT OR REPLACE INTO pregnancy_test_log (id, doeId, buckId, matingDate, testDate, result, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values: [log.id, log.doeId, log.buckId, log.matingDate, log.testDate, log.result, log.createdAt],
      });
    }
  }

  if (data.kindlingLogs) {
    for (const log of data.kindlingLogs) {
      // Drop this device's optimistic placeholder (local-ops' insertKindlingLog)
      // before the server's authoritative row lands, or the same birth shows
      // twice in سجل الولادة. Keyed on doeId + kindlingDate, NOT matingDate:
      // that column is nullable, and SQL '= NULL' matches nothing — while a
      // doe kindles at most once on a given date anyway.
      set.push({
        statement:
          "DELETE FROM kindling_log WHERE id LIKE 'local-%' AND doeId = ? AND kindlingDate = ?",
        values: [log.doeId, log.kindlingDate],
      });
      set.push({
        statement: `INSERT OR REPLACE INTO kindling_log (id, doeId, buckId, breedingId, matingDate, kindlingDate, bornAlive, bornDead, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          log.id,
          log.doeId,
          log.buckId,
          log.breedingId ?? null,
          log.matingDate,
          log.kindlingDate,
          log.bornAlive ?? 0,
          log.bornDead ?? 0,
          log.createdAt,
        ],
      });
    }
  }

  if (data.weaningLogs) {
    for (const log of data.weaningLogs) {
      // Same optimistic-placeholder reconciliation as kindlingLogs: drop this
      // device's local-<id> row (local-ops' insertWeaningLog) before the
      // server's authoritative row lands. Keyed on doeId + weaningDate (a doe
      // weans at most once on a given date; weaningDate is NOT NULL).
      set.push({
        statement:
          "DELETE FROM weaning_log WHERE id LIKE 'local-%' AND doeId = ? AND weaningDate = ?",
        values: [log.doeId, log.weaningDate],
      });
      set.push({
        statement: `INSERT OR REPLACE INTO weaning_log (id, doeId, buckId, breedingId, kindlingDate, weaningDate, bornAlive, bornDead, weaned, weaningWeightGrams, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          log.id,
          log.doeId,
          log.buckId,
          log.breedingId ?? null,
          log.kindlingDate ?? null,
          log.weaningDate,
          log.bornAlive ?? 0,
          log.bornDead ?? 0,
          log.weaned ?? null,
          log.weaningWeightGrams ?? null,
          log.createdAt,
        ],
      });
    }
  }

  if (data.matingLogs) {
    for (const log of data.matingLogs) {
      // No optimistic local placeholder to drop here — unlike
      // pregnancyTestLogs/kindlingLogs above, local-ops.ts never writes this
      // table (see mating_log's schema.sql comment); it's purely populated
      // from the server, so a plain upsert by id is enough.
      set.push({
        statement: `INSERT OR REPLACE INTO mating_log (id, doeId, buckId, matingDate, wasNursingAtMating, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        values: [log.id, log.doeId, log.buckId, log.matingDate, log.wasNursingAtMating ? 1 : 0, log.createdAt],
      });
    }
  }

  // Whether this pull actually brought down any real data, as opposed to
  // just advancing the cursor with nothing new — the UI only needs to
  // refresh (see syncNow's "local-db-updated" dispatch) in the former case.
  const hasChanges = set.length > 0;

  set.push({
    statement: "UPDATE sync_cursor SET since = ?, lastSyncAt = ?, lastResetAt = ? WHERE id = 1",
    values: [data.serverTime, nowIso(), serverResetAt],
  });

  if (set.length > 0) {
    console.log(`[DB] Executing batch of ${set.length} sync operations...`);
    await db.executeSet(set);
    if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
      await sqlite.saveToStore(dbName());
    }
    console.log("[DB] Sync operations batch execution finished successfully.");
  }

  return hasChanges;
}

// --- rejected-create reconciliation ---------------------------------------

// createQuickRabbit's local op (local-ops.ts) inserts the rabbit row
// unconditionally for instant UI feedback, before the server has confirmed
// anything. If the server later rejects that op, nothing else ever deletes
// the local row — and since hasUnsyncedOps() deliberately excludes
// 'rejected' ops (they already got a definitive answer), no amount of
// re-syncing would ever revisit it, leaving a phantom rabbit that inflates
// this device's counts forever. Sweep for that specific case on every sync.
// (startBreeding/markMated are deliberately not covered here — rolling those
// back also means reverting the doeState mutation and distinguishing the
// fork-vs-reuse branch, which is the sync plan's separate "forked-row
// cleanup" concern, not a simple delete.)
const REJECTABLE_CREATE_CLEANUP: Record<string, (db: SQLiteDBConnection, id: string) => Promise<void>> = {
  createQuickRabbit: async (db, id) => {
    await run(db, "DELETE FROM kit_stock_movement WHERE rabbitId = ?", [id]);
    await run(db, "DELETE FROM weight_record WHERE rabbitId = ?", [id]);
    await run(db, "DELETE FROM rabbit WHERE id = ?", [id]);
  },
};

async function reconcileRejectedCreates(): Promise<boolean> {
  const db = await getDb();
  const opTypes = Object.keys(REJECTABLE_CREATE_CLEANUP);
  const rejects = await queryAll<{ clientOpId: string; opType: string; payload: string }>(
    db,
    `SELECT clientOpId, opType, payload FROM outbox WHERE status = 'rejected' AND opType IN (${opTypes.map(() => "?").join(",")})`,
    opTypes
  );
  if (rejects.length === 0) return false;

  await withTransaction(async (txDb) => {
    for (const r of rejects) {
      const payload = JSON.parse(r.payload) as { id?: string };
      if (payload.id) await REJECTABLE_CREATE_CLEANUP[r.opType](txDb, payload.id);
    }
  });
  if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
    await sqlite.saveToStore(dbName());
  }
  return true;
}

// --- push ----------------------------------------------------------------

type OutboxRow = { clientOpId: string; opType: string; payload: string; clientAt: string };
type PushResult = { clientOpId: string; status: "applied" | "rejected" | "already_applied" | "error"; resultMessage?: string | null };

export async function push(): Promise<boolean> {
  const db = await getDb();
  const cursor = await getOrInitCursor(db);

  // Recovery: reset any orphaned 'syncing' ops from an interrupted sync back to 'pending'
  await run(db, "UPDATE outbox SET status = 'pending' WHERE status = 'syncing'");

  const pending = await queryAll<OutboxRow>(
    db,
    "SELECT clientOpId, opType, payload, clientAt FROM outbox WHERE status = 'pending' ORDER BY createdAt ASC LIMIT ?",
    [PUSH_BATCH_SIZE]
  );
  if (pending.length === 0) return false;

  const ids = pending.map((p) => p.clientOpId);
  await run(
    db,
    `UPDATE outbox SET status = 'syncing' WHERE clientOpId IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
    await sqlite.saveToStore(dbName());
  }

  let response: { serverTime: string; results: PushResult[] };
  try {
    response = (await syncFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        deviceId: cursor.deviceId,
        operations: pending.map((p) => ({
          clientOpId: p.clientOpId,
          opType: p.opType,
          payload: JSON.parse(p.payload),
          clientAt: p.clientAt,
        })),
      }),
    })) as { serverTime: string; results: PushResult[] };
  } catch (err) {
    // Network/server failure: put everything back to pending so the next
    // sync cycle retries — never leave a batch stuck in "syncing".
    await run(
      db,
      `UPDATE outbox SET status = 'pending' WHERE clientOpId IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
      await sqlite.saveToStore(dbName());
    }
    throw err;
  }

  await withTransaction(async (txDb) => {
    for (const result of response.results) {
      // "error" is a transient, server-side infra failure (dropped DB
      // connection, cold-start timeout, etc.) — never a deliberate
      // rejection. Put the op back to 'pending' so the next sync cycle
      // retries it, exactly like the network-failure catch above. Writing
      // "error" as a literal terminal status would silently strand the op
      // forever, since push()'s own SELECT only ever looks for 'pending'.
      const nextStatus = result.status === "error" ? "pending" : result.status;
      await run(txDb, "UPDATE outbox SET status = ?, resultMessage = ? WHERE clientOpId = ?", [
        nextStatus,
        result.resultMessage ?? null,
        result.clientOpId,
      ]);
    }
  });
  return true;
}

/** True if any outbox op hasn't reached the server yet (excludes 'rejected' — those already got a definitive server answer and are a review-screen concern, not a data-loss risk). */
export async function hasUnsyncedOps(): Promise<boolean> {
  const db = await getDb();
  const row = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) as n FROM outbox WHERE status IN ('pending', 'syncing')"
  );
  return (row?.n ?? 0) > 0;
}

/**
 * Drains the outbox by repeatedly calling push() (each call only handles one
 * PUSH_BATCH_SIZE-sized batch) until nothing pending remains or a call
 * fails. Used to force a sync-to-completion before sign-out, where leaving
 * queued ops behind would mean clearLocalMirror() silently deletes them.
 * Returns whether the outbox actually ended up empty.
 */
export async function flushOutbox(): Promise<boolean> {
  try {
    while (await push()) {
      // keep draining
    }
  } catch {
    // push() already reset its batch back to 'pending' on failure — the
    // hasUnsyncedOps() check below will reflect that.
  }
  return !(await hasUnsyncedOps());
}

// --- orchestrator + backoff ------------------------------------------------

let retryDelayMs = BACKOFF_BASE_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export async function syncNow(): Promise<void> {
  const netStatus = await Network.getStatus();
  if (!netStatus.connected) {
    setState({ status: "offline" });
    return;
  }

  clearRetryTimer();
  setState({ status: "syncing", lastError: null });
  try {
    let changed = await reconcileRejectedCreates();
    changed = (await pull()) || changed;
    const hasPushed = await push();
    if (hasPushed) {
      changed = (await pull()) || changed;
    }
    retryDelayMs = BACKOFF_BASE_MS;
    const db = await getDb();
    await refreshPendingCount(db);
    setState({ status: "idle", lastSyncAt: nowIso(), lastError: null });

    // Only force the visible page to refresh when a sync actually brought
    // down new/changed data — most foreground/periodic syncs are no-ops on a
    // farm with infrequent real changes, and re-dispatching on every one of
    // them was remounting whatever page was open (see app-shell's
    // key={dbVersion}), producing a visible loading-flash for nothing.
    if (changed && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("local-db-updated"));
    }
  } catch (err) {
    const db = await getDb();
    await refreshPendingCount(db);
    const message = err instanceof Error ? err.message : String(err);
    setState({ status: "error", lastError: message });
    retryTimer = setTimeout(() => {
      void syncNow();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, BACKOFF_MAX_MS);
  }
}

let networkListenerAttached = false;

/** Idempotent — safe to call from Phase 3's app-shell mount without tracking whether it's already wired up. */
export function attachNetworkListener(): void {
  if (networkListenerAttached) return;
  networkListenerAttached = true;
  Network.addListener("networkStatusChange", (status) => {
    if (status.connected) {
      void syncNow();
    } else {
      setState({ status: "offline" });
    }
  });
}

let periodicSyncTimer: ReturnType<typeof setInterval> | null = null;

function startPeriodicSync(): void {
  if (periodicSyncTimer) return;
  periodicSyncTimer = setInterval(() => void syncNow(), PERIODIC_SYNC_INTERVAL_MS);
}

function stopPeriodicSync(): void {
  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
  }
}

let lifecycleListenerAttached = false;

/**
 * Idempotent — call once from main.tsx alongside attachNetworkListener().
 * Starts the foreground periodic sync immediately (the app is active on
 * launch) and re-syncs on every foreground resume; stops the timer while
 * backgrounded so it never fires with the app out of view.
 */
export function attachAppLifecycleSync(): void {
  if (lifecycleListenerAttached) return;
  lifecycleListenerAttached = true;

  startPeriodicSync();

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      const sinceLastSync = state.lastSyncAt ? Date.now() - new Date(state.lastSyncAt).getTime() : Infinity;
      if (state.status !== "syncing" && sinceLastSync >= MIN_RESUME_SYNC_GAP_MS) {
        void syncNow();
      }
      startPeriodicSync();
    } else {
      stopPeriodicSync();
    }
  });
}
