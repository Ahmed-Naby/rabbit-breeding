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
import { getDb, withTransaction, sqlite } from "../db/client";
import { Capacitor } from "@capacitor/core";
import { queryAll, queryOne, run, nowIso } from "../db/helpers";
import { SYNC_API_BASE_URL, SYNC_SHARED_SECRET } from "../config";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { createId } from "@paralleldrive/cuid2";

const PUSH_BATCH_SIZE = 25;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;
// Pulls are cheap (delta-only, since-cursor) so a foreground timer is fine
// on a metered connection; paused while backgrounded (see attachAppLifecycleSync)
// so it never runs, or drains data/battery, while the app isn't in use.
const PERIODIC_SYNC_INTERVAL_MS = 4 * 60_000;
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

async function syncFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${SYNC_API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      "x-sync-key": SYNC_SHARED_SECRET,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let text = await res.text().catch(() => "");
    if (text.includes("<html") || text.includes("<!DOCTYPE")) {
      text = "HTML response received instead of JSON. Your Vercel deployment might have 'Deployment Protection' enabled.";
    }
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// --- device/cursor bookkeeping ---------------------------------------------

type CursorRow = { id: 1; deviceId: string; since: string | null; lastSyncAt: string | null };

async function getOrInitCursor(db: SQLiteDBConnection): Promise<CursorRow> {
  const existing = await queryOne<CursorRow>(db, "SELECT * FROM sync_cursor WHERE id = 1");
  if (existing) return existing;

  const deviceId = createId();
  await run(db, "INSERT INTO sync_cursor (id, deviceId, since, lastSyncAt) VALUES (1, ?, NULL, NULL)", [
    deviceId,
  ]);
  return { id: 1, deviceId, since: null, lastSyncAt: null };
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
};

function applyPulledSettings(db: SQLiteDBConnection, s: Record<string, unknown>) {
  return run(
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
      s.weightUnit,
      s.gestationDays,
      s.gestationWindowDays,
      s.pregnancyTestDays,
      s.weaningDays,
      s.nestBoxDays,
      s.matingWeightGrams,
      s.rebreedAfterKindlingDays,
      s.currency,
    ]
  );
}

function applyPulledRabbit(db: SQLiteDBConnection, r: Record<string, unknown>) {
  return run(
    db,
    `INSERT OR REPLACE INTO rabbit (id, tagId, breed, color, sex, dateOfBirth, status, doeState, cage, origin, movedToHerdPen, acquiredDate, acquiredFrom, notes, photoUrl, sireId, damId, litterId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.tagId, r.breed, r.color, r.sex, r.dateOfBirth, r.status, r.doeState, r.cage, r.origin,
      r.movedToHerdPen ? 1 : 0, r.acquiredDate, r.acquiredFrom, r.notes, r.photoUrl, r.sireId, r.damId,
      r.litterId, r.createdAt, r.updatedAt,
    ]
  );
}

function applyPulledBreeding(db: SQLiteDBConnection, b: Record<string, unknown>) {
  return run(
    db,
    `INSERT OR REPLACE INTO breeding (id, buckId, doeId, matingDate, expectedKindlingDate, actualKindlingDate, nestBoxDate, outcome, pregnancyTestResult, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.id, b.buckId, b.doeId, b.matingDate, b.expectedKindlingDate, b.actualKindlingDate, b.nestBoxDate,
      b.outcome, b.pregnancyTestResult, b.notes, b.createdAt, b.updatedAt,
    ]
  );
}

/**
 * Keyed by breedingId (UNIQUE locally), not id — this is what lets a
 * server-confirmed litter row transparently replace a locally-created
 * placeholder (see local-ops.ts's upsertLitterByBreedingId) without any
 * separate cleanup pass: the placeholder's id column just gets overwritten.
 */
function applyPulledLitter(db: SQLiteDBConnection, l: Record<string, unknown>) {
  return run(
    db,
    `INSERT INTO litter (id, breedingId, kindlingDate, bornAlive, bornDead, weaned, weaningDate, weaningWeightGrams, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(breedingId) DO UPDATE SET
       id = excluded.id, kindlingDate = excluded.kindlingDate, bornAlive = excluded.bornAlive,
       bornDead = excluded.bornDead, weaned = excluded.weaned, weaningDate = excluded.weaningDate,
       weaningWeightGrams = excluded.weaningWeightGrams, notes = excluded.notes, updatedAt = excluded.updatedAt`,
    [
      l.id, l.breedingId, l.kindlingDate, l.bornAlive, l.bornDead, l.weaned, l.weaningDate,
      l.weaningWeightGrams, l.notes, l.createdAt, l.updatedAt,
    ]
  );
}

/**
 * WeightRecord has no natural unique key the way litter has breedingId (a
 * rabbit can have many). Locally-created placeholders use a "local-"-prefixed
 * id (see local-ops.ts's upsertLatestWeightRecord); the (rabbitId, date) pair
 * they were created with is a safe-enough match for the server's real row —
 * delete the placeholder first, then insert the authoritative one.
 */
async function applyPulledWeightRecord(db: SQLiteDBConnection, w: Record<string, unknown>) {
  await run(db, "DELETE FROM weight_record WHERE id LIKE 'local-%' AND rabbitId = ? AND date = ?", [
    w.rabbitId,
    w.date,
  ]);
  await run(
    db,
    `INSERT OR REPLACE INTO weight_record (id, rabbitId, date, weightGrams, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [w.id, w.rabbitId, w.date, w.weightGrams, w.notes, w.createdAt, w.updatedAt]
  );
}

export async function pull(): Promise<boolean> {
  const db = await getDb();
  const cursor = await getOrInitCursor(db);

  const cb = Date.now();
  const path = cursor.since
    ? `/api/sync/pull?since=${encodeURIComponent(cursor.since)}&_cb=${cb}`
    : `/api/sync/bootstrap?_cb=${cb}`;
  const data = (await syncFetch(path)) as PullResponse;

  const set: { statement: string; values?: any[] }[] = [];

  if (data.settings) {
    const s = data.settings;
    set.push({
      statement: `INSERT INTO settings_cache (id, weightUnit, gestationDays, gestationWindowDays, pregnancyTestDays, weaningDays, nestBoxDays, matingWeightGrams, rebreedAfterKindlingDays, currency)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         weightUnit = excluded.weightUnit, gestationDays = excluded.gestationDays,
         gestationWindowDays = excluded.gestationWindowDays, pregnancyTestDays = excluded.pregnancyTestDays,
         weaningDays = excluded.weaningDays, nestBoxDays = excluded.nestBoxDays,
         matingWeightGrams = excluded.matingWeightGrams, rebreedAfterKindlingDays = excluded.rebreedAfterKindlingDays,
         currency = excluded.currency`,
      values: [
        s.weightUnit,
        s.gestationDays,
        s.gestationWindowDays,
        s.pregnancyTestDays,
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
      statement: `INSERT OR REPLACE INTO rabbit (id, tagId, breed, color, sex, dateOfBirth, status, doeState, cage, origin, movedToHerdPen, acquiredDate, acquiredFrom, notes, photoUrl, sireId, damId, litterId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        r.id, r.tagId, r.breed, r.color, r.sex, r.dateOfBirth, r.status, r.doeState, r.cage, r.origin,
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
        statement: `INSERT OR REPLACE INTO transaction_ledger (id, date, type, category, amountCents, notes, rabbitId, feedLogId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          t.id, t.date, t.type, t.category, t.amountCents, t.notes, t.rabbitId,
          t.feedLogId, t.createdAt, t.updatedAt ?? t.createdAt,
        ],
      });
    }
  }

  if (data.breeds) {
    set.push({ statement: "DELETE FROM breed", values: [] });
    for (const b of data.breeds) {
      set.push({
        statement: "INSERT OR REPLACE INTO breed (id, name, createdAt) VALUES (?, ?, ?)",
        values: [b.id, b.name, b.createdAt],
      });
    }
  }

  if (data.pregnancyTestLogs) {
    for (const log of data.pregnancyTestLogs) {
      set.push({
        statement: `INSERT OR REPLACE INTO pregnancy_test_log (id, doeId, buckId, matingDate, testDate, result, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values: [log.id, log.doeId, log.buckId, log.matingDate, log.testDate, log.result, log.createdAt],
      });
    }
  }

  if (data.kindlingLogs) {
    for (const log of data.kindlingLogs) {
      set.push({
        statement: `INSERT OR REPLACE INTO kindling_log (id, doeId, buckId, matingDate, kindlingDate, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        values: [log.id, log.doeId, log.buckId, log.matingDate, log.kindlingDate, log.createdAt],
      });
    }
  }

  // Whether this pull actually brought down any real data, as opposed to
  // just advancing the cursor with nothing new — the UI only needs to
  // refresh (see syncNow's "local-db-updated" dispatch) in the former case.
  const hasChanges = set.length > 0;

  set.push({
    statement: "UPDATE sync_cursor SET since = ?, lastSyncAt = ? WHERE id = 1",
    values: [data.serverTime, nowIso()],
  });

  if (set.length > 0) {
    console.log(`[DB] Executing batch of ${set.length} sync operations...`);
    await db.executeSet(set);
    if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
      await sqlite.saveToStore("rabbittrack");
    }
    console.log("[DB] Sync operations batch execution finished successfully.");
  }

  return hasChanges;
}

// --- push ----------------------------------------------------------------

type OutboxRow = { clientOpId: string; opType: string; payload: string; clientAt: string };
type PushResult = { clientOpId: string; status: "applied" | "rejected" | "already_applied"; resultMessage?: string | null };

export async function push(): Promise<boolean> {
  const db = await getDb();
  const cursor = await getOrInitCursor(db);

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
    await sqlite.saveToStore("rabbittrack");
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
      await sqlite.saveToStore("rabbittrack");
    }
    throw err;
  }

  await withTransaction(async (txDb) => {
    for (const result of response.results) {
      await run(txDb, "UPDATE outbox SET status = ?, resultMessage = ? WHERE clientOpId = ?", [
        result.status,
        result.resultMessage ?? null,
        result.clientOpId,
      ]);
    }
  });
  return true;
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
    let changed = await pull();
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
