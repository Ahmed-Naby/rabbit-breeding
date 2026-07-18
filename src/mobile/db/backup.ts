import { createId } from "@paralleldrive/cuid2";
import { sqlite, getDb, closeDb, withTransaction } from "./client";
import { queryAll, queryOne, run } from "./helpers";
import { syncFetch } from "../sync/sync-manager";
import { WIPE_CONFIRM_PHRASE } from "@/lib/sync/wipe-confirm-phrase";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/sync/restore-confirm-phrase";

/** Serializes the entire local database (schema + rows, including any unsynced outbox entries) to a JSON string. */
export async function exportBackup(): Promise<string> {
  const db = await getDb();
  const { export: json } = await db.exportToJson("full");
  if (!json) throw new Error("EXPORT_FAILED");
  return JSON.stringify(json);
}

/**
 * Wipes the local database and replaces it with the contents of a previously
 * exported backup. Callers are responsible for reloading the app afterwards
 * so every page re-opens the connection and re-reads fresh data.
 */
export async function restoreBackup(json: string): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("INVALID_BACKUP_FILE");
  }
  parsed.overwrite = true;
  const jsonString = JSON.stringify(parsed);

  let valid: boolean | undefined = false;
  try {
    ({ result: valid } = await sqlite.isJsonValid(jsonString));
  } catch {
    // The plugin throws (rather than returning result: false) for JSON that
    // doesn't match its export schema at all — e.g. an online full-export
    // backup, which has a completely different shape from a local SQLite
    // export and was never meant to be fed into this path.
  }
  if (!valid) throw new Error("INVALID_BACKUP_FILE");

  // sync_cursor is this device's live sync-protocol bookkeeping, not
  // portable farm data — a backup taken before the device's first
  // successful sync (or simply an older export) can carry an empty/stale
  // cursor. If the import below overwrote a real cursor with that, the very
  // next pull() would see lastResetAt go from a known value back to NULL,
  // read that as "server was reset since we last looked", and wipe every
  // table it just restored (see pull()'s dataResetAt check in
  // sync-manager.ts) before re-bootstrapping from the server — which never
  // received this device's not-yet-pushed rows, leaving the app empty.
  // Carrying the device's own pre-restore cursor forward avoids that.
  const preRestoreDb = await getDb();
  const preRestoreCursor = await queryOne<{
    deviceId: string;
    since: string | null;
    lastSyncAt: string | null;
    lastResetAt: string | null;
  }>(preRestoreDb, "SELECT deviceId, since, lastSyncAt, lastResetAt FROM sync_cursor WHERE id = 1");

  await closeDb();
  await sqlite.importFromJson(jsonString);

  // On web, importFromJson() opens and closes its own private database
  // handle internally — it never registers a connection under DB_NAME, so
  // there is nothing yet for saveToStore() to find. Reopening via getDb()
  // re-registers a real connection (idempotently re-applying schema.sql,
  // a no-op against the tables we just imported) and, on web, that reopen
  // itself persists the imported data to the store — the same path every
  // normal app startup already goes through.
  await getDb();

  if (preRestoreCursor) {
    await withTransaction(async (db) => {
      await run(
        db,
        `INSERT INTO sync_cursor (id, deviceId, since, lastSyncAt, lastResetAt) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           deviceId = excluded.deviceId, since = excluded.since,
           lastSyncAt = excluded.lastSyncAt, lastResetAt = excluded.lastResetAt`,
        [preRestoreCursor.deviceId, preRestoreCursor.since, preRestoreCursor.lastSyncAt, preRestoreCursor.lastResetAt]
      );
    });
  }

  // The sync protocol is operation-replay: push() only uploads queued outbox
  // *operations*, never table state — and every op in a restored backup is
  // already status "applied" (and permanently remembered by the server's
  // SyncOperation ledger, so re-marking it pending would just come back
  // already_applied). Left as-is, the restored rows would exist only on this
  // device while every pull kept re-asserting the server's state over them.
  // The system's one state-upload channel is the danger-zone full-import
  // endpoint, so a local restore finishes by pushing the restored snapshot
  // through it: the server wipes, re-inserts, and stamps a fresh
  // dataResetAt, and this device's next pull (after the caller's reload)
  // detects the reset and re-bootstraps — both ends converge on the file.
  try {
    const data = await readRestoredSnapshot();
    await syncFetch("/api/sync/full-import", {
      method: "POST",
      body: JSON.stringify({ confirm: RESTORE_CONFIRM_PHRASE, data }),
    });
  } catch {
    // Local restore itself succeeded — surface a distinct error so the
    // settings page can tell the user the online database wasn't updated
    // (offline / server unreachable) and they should retry when connected.
    throw new Error("RESTORE_UPLOAD_FAILED");
  }
}

/**
 * Reads the just-restored local mirror back out in the FullExportData shape
 * /api/sync/full-import expects (see src/lib/sync/import.ts). Column lists
 * are explicit because a few mirror tables carry extra local-only columns
 * (updatedAt on foster_log/health_record/kit_stock_movement, feedLogId on
 * transaction_ledger) that the server models don't have — Prisma createMany
 * rejects unknown fields. feedLogs has no local mirror, so it's always [].
 */
async function readRestoredSnapshot(): Promise<Record<string, unknown>> {
  const db = await getDb();
  type Row = Record<string, unknown>;

  const [
    settings, rabbits, breedings, litters, weightRecords, healthRecords,
    transactions, kitStockMovements, breeds, pregnancyTestLogs, kindlingLogs, fosterLogs,
  ] = await Promise.all([
    queryOne<Row>(
      db,
      `SELECT weightUnit, gestationDays, gestationWindowDays, pregnancyTestDays, weaningDays,
              nestBoxDays, matingWeightGrams, rebreedAfterKindlingDays, currency
       FROM settings_cache WHERE id = 1`
    ),
    queryAll<Row>(
      db,
      `SELECT id, tagId, retiredTagId, breed, color, sex, dateOfBirth, status, doeState, cage, origin,
              movedToHerdPen, acquiredDate, acquiredFrom, notes, photoUrl, sireId, damId, litterId,
              createdAt, updatedAt
       FROM rabbit`
    ),
    queryAll<Row>(
      db,
      `SELECT id, buckId, doeId, matingDate, expectedKindlingDate, actualKindlingDate, nestBoxDate,
              outcome, pregnancyTestResult, notes, createdAt, updatedAt
       FROM breeding`
    ),
    queryAll<Row>(
      db,
      `SELECT id, breedingId, kindlingDate, bornAlive, bornDead, weaned, weaningDate,
              weaningWeightGrams, notes, createdAt, updatedAt
       FROM litter`
    ),
    queryAll<Row>(
      db,
      "SELECT id, rabbitId, date, weightGrams, notes, createdAt, updatedAt FROM weight_record"
    ),
    queryAll<Row>(
      db,
      "SELECT id, rabbitId, date, type, description, nextDueDate, createdAt FROM health_record"
    ),
    queryAll<Row>(
      db,
      "SELECT id, rabbitId, date, type, category, amountCents, notes, createdAt FROM transaction_ledger"
    ),
    queryAll<Row>(
      db,
      `SELECT id, date, type, count, weightGrams, pricePerKgCents, amountCents, transactionId,
              rabbitId, notes, createdAt
       FROM kit_stock_movement`
    ),
    queryAll<Row>(db, "SELECT id, name, createdAt FROM breed"),
    queryAll<Row>(
      db,
      "SELECT id, doeId, buckId, matingDate, testDate, result, createdAt FROM pregnancy_test_log"
    ),
    queryAll<Row>(
      db,
      "SELECT id, doeId, buckId, matingDate, kindlingDate, createdAt FROM kindling_log"
    ),
    queryAll<Row>(db, "SELECT id, fromDoeId, toDoeId, count, date, createdAt FROM foster_log"),
  ]);

  // local-ops creates some rows under "local-"-prefixed placeholder ids (see
  // its file header). Those must never become the server's authoritative ids:
  // pull()'s placeholder reconciliation on every device matches ids by that
  // prefix, so a server row carrying one gets mistaken for a stale local
  // placeholder and cleaned up right after being applied — the row would
  // vanish from every device's mirror while remaining on the server. Give
  // any such row a fresh permanent cuid at upload time, patching the two
  // columns that can reference a remapped id (rabbit.litterId,
  // kit_stock_movement.transactionId). Rabbits and breedings never carry
  // local- ids (their creating ops inject a client cuid up front — see
  // outbox.ts's CREATING_OP_TYPES), so their ids — referenced all over the
  // schema — are safe to pass through untouched.
  const litterIds = new Map<string, string>();
  const txIds = new Map<string, string>();
  const withPermanentId = (idMap?: Map<string, string>) => (row: Row): Row => {
    const id = row.id as string;
    if (!id.startsWith("local-")) return row;
    const fresh = createId();
    idMap?.set(id, fresh);
    return { ...row, id: fresh };
  };

  const remappedLitters = litters.map(withPermanentId(litterIds));
  const remappedTransactions = transactions.map(withPermanentId(txIds));

  return {
    settings,
    // SQLite stores booleans as 0/1; Prisma validates the real type.
    rabbits: rabbits.map((r) => ({
      ...r,
      movedToHerdPen: !!r.movedToHerdPen,
      litterId: litterIds.get(r.litterId as string) ?? r.litterId,
    })),
    breedings,
    litters: remappedLitters,
    weightRecords: weightRecords.map(withPermanentId()),
    healthRecords: healthRecords.map(withPermanentId()),
    feedLogs: [],
    transactions: remappedTransactions,
    kitStockMovements: kitStockMovements.map(withPermanentId()).map((m) => ({
      ...m,
      transactionId: txIds.get(m.transactionId as string) ?? m.transactionId,
    })),
    breeds: breeds.map(withPermanentId()),
    pregnancyTestLogs,
    kindlingLogs,
    fosterLogs: fosterLogs.map(withPermanentId()),
  };
}

/**
 * Empties every local table (including the outbox and the sync cursor), so
 * the device starts from a clean slate. Any not-yet-synced local changes are
 * gone for good; a subsequent sync re-bootstraps everything else from the
 * server since the cursor reset makes the next pull a full pull.
 */
/**
 * Fetches a complete, uncapped snapshot of the central (Postgres) database —
 * the mandatory recovery copy the Danger Zone's "wipe online database" flow
 * requires the user to download before wipeOnlineDatabase() is unlocked.
 * Distinct from exportBackup() above, which only ever covers this device's
 * local SQLite mirror.
 */
export async function exportOnlineBackup(): Promise<string> {
  const data = await syncFetch(`/api/sync/full-export?_cb=${Date.now()}`);
  return JSON.stringify(data);
}

/**
 * Permanently deletes every farm-data row from the central database, for
 * every device that syncs against it — not just this one. `confirmPhrase`
 * must match WIPE_CONFIRM_PHRASE exactly; the caller (the settings page) is
 * responsible for the actual typed-confirmation UI, this is just the
 * network call. Does not touch this device's local mirror — the next
 * pull()/syncNow() call discovers the server's new Settings.dataResetAt and
 * wipes+re-bootstraps this device the same way it will for every other
 * device that syncs after this call.
 */
export async function wipeOnlineDatabase(confirmPhrase: string): Promise<void> {
  if (confirmPhrase !== WIPE_CONFIRM_PHRASE) throw new Error("CONFIRM_PHRASE_MISMATCH");
  await syncFetch("/api/sync/wipe", {
    method: "POST",
    body: JSON.stringify({ confirm: confirmPhrase }),
  });
}

// Mirrors the server's REQUIRED_KEYS check in src/lib/sync/import.ts —
// duplicated here (rather than imported) because that module pulls in
// Prisma's Node-only driver adapter, which can't be bundled into the
// mobile app.
const FULL_EXPORT_KEYS = [
  "rabbits", "breedings", "litters", "weightRecords", "healthRecords",
  "feedLogs", "transactions", "kitStockMovements", "breeds",
  "pregnancyTestLogs", "kindlingLogs", "fosterLogs",
];

/**
 * Overwrites every farm-data row in the central database with the contents
 * of a previously downloaded online backup file (see exportOnlineBackup()
 * above) — for every device, not just this one. `confirmPhrase` must match
 * RESTORE_CONFIRM_PHRASE exactly; the caller (the settings page) owns the
 * typed-confirmation UI, this is just validation + the network call. Does
 * not touch this device's local mirror directly — the next pull()/syncNow()
 * call discovers the server's new Settings.dataResetAt and wipes +
 * re-bootstraps this device the same way it will for every other device.
 */
export async function restoreOnlineDatabase(confirmPhrase: string, json: string): Promise<void> {
  if (confirmPhrase !== RESTORE_CONFIRM_PHRASE) throw new Error("CONFIRM_PHRASE_MISMATCH");

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("INVALID_BACKUP_FILE");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !FULL_EXPORT_KEYS.every((key) => Array.isArray((parsed as Record<string, unknown>)[key]))
  ) {
    throw new Error("INVALID_BACKUP_FILE");
  }

  await syncFetch("/api/sync/full-import", {
    method: "POST",
    body: JSON.stringify({ confirm: confirmPhrase, data: parsed }),
  });
}

export async function resetDatabase(): Promise<void> {
  await withTransaction(async (db) => {
    const tables = await queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'android_metadata'"
    );
    for (const { name } of tables) {
      await run(db, `DELETE FROM "${name}"`);
    }
  });
}
