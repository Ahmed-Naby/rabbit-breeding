import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";

// Bundled as a raw string by the mobile build (see vite.config.mobile.ts,
// Phase 3) rather than fetched at runtime — schema.sql only ever needs
// reading once, at first-open, via `applySchema` below.
import schemaSql from "./schema.sql?raw";

// Falls back to a shared name only for the brief pre-login window (the
// login/register screen may open a connection via clearLocalMirror-style
// calls before any farm is known). Once a session exists this is always
// overridden via setActiveFarmId before any real data is read.
const FALLBACK_DB_NAME = "rabbittrack_anon";

let activeFarmId: string | null = null;

/**
 * Each farm gets its own local SQLite database/store, keyed by farm id.
 * Must be called once, synchronously, right after loadSession() resolves at
 * boot (see main.tsx) and BEFORE any getDb()/withTransaction() call — every
 * identity or farm change in this app (login, register, logout, switch
 * farm) ends in a full window.location.reload(), so this only ever needs
 * to be set once per JS context, never updated live mid-session.
 */
export function setActiveFarmId(farmId: string | null): void {
  activeFarmId = farmId;
}

/** The current farm-scoped local database name (see setActiveFarmId). */
export function dbName(): string {
  return activeFarmId ? `rabbittrack_${activeFarmId}` : FALLBACK_DB_NAME;
}

export const sqlite = new SQLiteConnection(CapacitorSQLite);

let dbPromise: Promise<SQLiteDBConnection> | null = null;

/**
 * On the web platform (browser dev preview, no native plugin backing it) the
 * SQLite wasm store needs an explicit init and a `<jeep-sqlite>` element
 * present in the DOM (added by the Phase 3 app shell) before any connection
 * can be created. Native (Android) needs neither.
 */
async function initWebStoreIfNeeded(): Promise<void> {
  if (Capacitor.getPlatform() === "android" || Capacitor.getPlatform() === "ios") return;
  console.log("[DB] initWebStoreIfNeeded starting");
  await sqlite.initWebStore();
  console.log("[DB] initWebStoreIfNeeded finished");
}

async function openConnection(): Promise<SQLiteDBConnection> {
  console.log("[DB] openConnection v3 starting");
  await initWebStoreIfNeeded();

  const name = dbName();
  const alreadyOpen = await sqlite.isConnection(name, false);
  let db: SQLiteDBConnection;
  if (alreadyOpen.result) {
    // Same JS context re-open (e.g. retry after a failed boot) — reuse.
    db = await sqlite.retrieveConnection(name, false);
  } else {
    // Fresh JS context. On native the plugin's connection map lives in the
    // Activity and survives WebView reloads — which login, register, and
    // farm-switch all trigger via window.location.reload(). A connection
    // created before the reload is still registered natively while this
    // context's JS map is empty, so createConnection() throws "Connection
    // <name> already exists". checkConnectionsConsistency() proved
    // unreliable at reconciling this, so deterministically close any such
    // orphan via the RAW plugin (bypassing the JS wrapper, whose map doesn't
    // know the orphan and would refuse). The close rejects harmlessly on a
    // first-ever open when nothing is registered natively.
    if (Capacitor.getPlatform() === "android" || Capacitor.getPlatform() === "ios") {
      try {
        await CapacitorSQLite.closeConnection({ database: name, readonly: false });
        console.log("[DB] closed orphaned native connection from before reload");
      } catch {
        // No orphaned native connection — first open on this device.
      }
    }
    db = await sqlite.createConnection(name, false, "no-encryption", 1, false);
  }

  console.log("[DB] opening database");
  if (!(await db.isDBOpen()).result) {
    await db.open();
  }
  console.log("[DB] database opened, applying schema");
  await applySchema(db);
  console.log("[DB] schema applied, connection ready");
  return db;
}

// schema.sql's CREATE TABLE IF NOT EXISTS is a no-op on a device that
// already provisioned its local DB before a column was added — there's no
// migration framework here, so new columns on existing tables need an
// explicit, individually-guarded ALTER TABLE. Errors (column already
// exists) are swallowed; this only ever needs to succeed once per device.
async function applyColumnMigrations(db: SQLiteDBConnection): Promise<void> {
  const migrations = [
    `ALTER TABLE rabbit ADD COLUMN retiredTagId TEXT`,
    `ALTER TABLE sync_cursor ADD COLUMN lastResetAt TEXT`,
    `ALTER TABLE sync_cursor ADD COLUMN mirrorRefreshV INTEGER`,
    `ALTER TABLE breeding ADD COLUMN palpationConfirmedDate TEXT`,
    `ALTER TABLE settings_cache ADD COLUMN palpationCheckDays INTEGER NOT NULL DEFAULT 15`,
    `ALTER TABLE kindling_log ADD COLUMN breedingId TEXT`,
    `ALTER TABLE kindling_log ADD COLUMN bornAlive INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE kindling_log ADD COLUMN bornDead INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN fosterWindowDays INTEGER NOT NULL DEFAULT 2`,
    `ALTER TABLE settings_cache ADD COLUMN fosterHighKits INTEGER NOT NULL DEFAULT 8`,
    `ALTER TABLE settings_cache ADD COLUMN fosterLowKits INTEGER NOT NULL DEFAULT 4`,
    `ALTER TABLE settings_cache ADD COLUMN defaultPricePerKgCents INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN feedPricePerTonCents INTEGER NOT NULL DEFAULT 0`,
    // feedGramsPerDoePerDay was added and then superseded within a day by the
    // six per-class rations below. It is deliberately NOT dropped: it shipped
    // NOT NULL DEFAULT 0, nothing reads or writes it anymore, and a DROP here
    // would rewrite the table on every device to remove a harmless zero.
    `ALTER TABLE settings_cache ADD COLUMN feedGramsDoeIdlePerDay INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN feedGramsDoePregnantPerDay INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN feedGramsDoeNursingPerDay INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN feedGramsBuckPerDay INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN feedGramsGrowerPerDay INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings_cache ADD COLUMN feedGramsJuvenilePerDay INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE kindling_log ADD COLUMN bornAliveAtKindling INTEGER NOT NULL DEFAULT 0`,
    // Backfill for rows that predate the column, matching the server
    // migration: bornAlive is the closest surviving value, exact for any litter
    // that never lost or fostered a kit. This one re-runs on every startup
    // (each statement is independently try/caught), which is harmless — the
    // WHERE skips every row the server has since sent a real value for.
    `UPDATE kindling_log SET bornAliveAtKindling = bornAlive WHERE bornAliveAtKindling = 0`,
    // Stillborns at birth. Defaults to -1 and — unlike its bornAlive sibling
    // above — is deliberately NOT backfilled: 0 is a legitimate birth value
    // here (most litters have no stillborns), so a row filled in from the
    // by-then-larger bornDead would be indistinguishable from a doe that truly
    // lost nothing, and «نسبة بقاء الفطام» would read ~100% across all history.
    // -1 can only mean "predates the column"; see src/lib/kit-mortality.ts.
    `ALTER TABLE kindling_log ADD COLUMN bornDeadAtKindling INTEGER NOT NULL DEFAULT -1`,
    // Same sentinel on the weaning archive, where the survival rate is actually
    // computed (the rate needs bornAlive + bornDead + this, all on one row).
    `ALTER TABLE weaning_log ADD COLUMN bornDeadAtKindling INTEGER NOT NULL DEFAULT -1`,
    // Nullable, unlike every settings column above it: NULL means the farm has
    // never configured any fixed monthly expenses, which must stay
    // distinguishable from an explicit empty list it deliberately cleared.
    `ALTER TABLE settings_cache ADD COLUMN recurringExpenses TEXT`,
    // One-off repair, not a schema change: every بيع/نافق/تسوية recorded on a
    // phone left an optimistic "local-" row that the server's pulled copy then
    // landed *beside* instead of on top of (different id, and the pull's
    // date-based fallback compared "2026-08-02" against a full ISO string), so
    // each one was counted twice in المخزون المتاح. The ops now carry a client
    // id, but the incremental pull never revisits an old movement to clean up
    // after itself, so the leftovers are dropped here: a "local-" row is a
    // duplicate exactly when the server has sent a row of the same type, day
    // and count. Re-runs harmlessly on every startup once nothing matches.
    `DELETE FROM kit_stock_movement
       WHERE id LIKE 'local-%'
         AND EXISTS (
           SELECT 1 FROM kit_stock_movement AS server
            WHERE server.id NOT LIKE 'local-%'
              AND server.type = kit_stock_movement.type
              AND server.count = kit_stock_movement.count
              AND substr(server.date, 1, 10) = substr(kit_stock_movement.date, 1, 10)
         )`,
    // The same repair for every other table whose placeholder cleanup was
    // defeated by that date seam. Each one is "drop the local- row when the
    // server has already sent its counterpart", matched on the same columns
    // the pull's own fallback uses, so a row survives here exactly when the
    // pull would have kept it. foster_log is in the list because its cleanup
    // didn't exist at all — every adoption entered on a phone was showing
    // twice — and transaction_ledger because its duplicate isn't just a
    // repeated line, it doubles the figure in الحسابات.
    `DELETE FROM weight_record WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM weight_record AS s WHERE s.id NOT LIKE 'local-%'
        AND s.rabbitId = weight_record.rabbitId
        AND substr(s.date, 1, 10) = substr(weight_record.date, 1, 10))`,
    `DELETE FROM health_record WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM health_record AS s WHERE s.id NOT LIKE 'local-%'
        AND s.rabbitId = health_record.rabbitId AND s.type = health_record.type
        AND substr(s.date, 1, 10) = substr(health_record.date, 1, 10))`,
    `DELETE FROM transaction_ledger WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM transaction_ledger AS s WHERE s.id NOT LIKE 'local-%'
        AND s.type = transaction_ledger.type AND s.category = transaction_ledger.category
        AND s.amountCents = transaction_ledger.amountCents
        AND substr(s.date, 1, 10) = substr(transaction_ledger.date, 1, 10))`,
    `DELETE FROM foster_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM foster_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.fromDoeId = foster_log.fromDoeId AND s.toDoeId = foster_log.toDoeId
        AND s.count = foster_log.count
        AND substr(s.date, 1, 10) = substr(foster_log.date, 1, 10))`,
    `DELETE FROM kindling_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM kindling_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = kindling_log.doeId
        AND substr(s.kindlingDate, 1, 10) = substr(kindling_log.kindlingDate, 1, 10))`,
    `DELETE FROM weaning_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM weaning_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = weaning_log.doeId
        AND substr(s.weaningDate, 1, 10) = substr(weaning_log.weaningDate, 1, 10))`,
    `DELETE FROM mating_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM mating_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = mating_log.doeId
        AND substr(s.matingDate, 1, 10) = substr(mating_log.matingDate, 1, 10))`,
    `DELETE FROM nest_box_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM nest_box_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = nest_box_log.doeId
        AND substr(s.nestBoxDate, 1, 10) = substr(nest_box_log.nestBoxDate, 1, 10))`,
    `DELETE FROM kit_death_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM kit_death_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = kit_death_log.doeId AND s.count = kit_death_log.count
        AND substr(s.deathDate, 1, 10) = substr(kit_death_log.deathDate, 1, 10))`,
    `DELETE FROM pregnancy_test_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM pregnancy_test_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = pregnancy_test_log.doeId AND s.result = pregnancy_test_log.result
        AND substr(s.matingDate, 1, 10) = substr(pregnancy_test_log.matingDate, 1, 10))`,
    `DELETE FROM resorption_log WHERE id LIKE 'local-%' AND EXISTS (
       SELECT 1 FROM resorption_log AS s WHERE s.id NOT LIKE 'local-%'
        AND s.doeId = resorption_log.doeId
        AND substr(s.matingDate, 1, 10) = substr(resorption_log.matingDate, 1, 10))`,
  ];
  for (const sql of migrations) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists — fine.
    }
  }
}

/**
 * Splits schema.sql into individual statements, stripping `--` line comments
 * first. The native Android/iOS SQLite plugin's whole-string execute() is
 * less forgiving than the web (jeep-sqlite) path: a `--` comment sitting
 * directly above a CREATE gets mis-parsed and silently drops that statement,
 * leaving later tables (settings_cache, sync_cursor, …) uncreated — which
 * stranded the app on the loading screen. Running each statement on its own,
 * comment-free, makes every table create regardless of that quirk.
 */
function schemaStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => {
      const commentAt = line.indexOf("--");
      return commentAt >= 0 ? line.slice(0, commentAt) : line;
    })
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function applySchema(db: SQLiteDBConnection): Promise<void> {
  console.log("[DB] applySchema starting");
  for (const statement of schemaStatements(schemaSql)) {
    await db.execute(statement, false);
  }
  await applyColumnMigrations(db);
  if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
    await sqlite.saveToStore(dbName());
  }
  console.log("[DB] applySchema finished");
}

/** Returns the (lazily opened, singleton) local database connection. */
export function getDb(): Promise<SQLiteDBConnection> {
  if (!dbPromise) {
    console.log("[DB] getDb creating new connection promise");
    dbPromise = openConnection().catch((err) => {
      console.error("[DB] getDb failed:", err);
      dbPromise = null; // allow retry on next getDb() call
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Closes the singleton connection (if open) and, critically, resets the
 * cached `dbPromise` so the next getDb() call transparently reopens a fresh
 * one. Callers that need to close the connection out from under the plugin
 * (e.g. restoreBackup's importFromJson, which requires no open connection)
 * MUST go through this rather than calling sqlite.closeConnection directly —
 * otherwise dbPromise keeps resolving to a JS handle for a connection that
 * no longer exists underneath it, and every query after that fails with
 * "No available connection" until a full page reload happens to occur.
 */
export async function closeDb(): Promise<void> {
  dbPromise = null;
  const name = dbName();
  const isOpen = await sqlite.isConnection(name, false);
  if (isOpen.result) {
    await sqlite.closeConnection(name, false);
  }
}

/**
 * Runs `fn` inside a local SQLite transaction, rolling back if it throws.
 * Used for outbox-enqueue (write the outbox row + apply the optimistic
 * mirror-table patch atomically) and for pull (replace a batch of rows
 * atomically so a mid-pull crash never leaves the mirror half-updated).
 */
export async function withTransaction<T>(fn: (db: SQLiteDBConnection) => Promise<T>): Promise<T> {
  const db = await getDb();
  await db.beginTransaction();
  try {
    const result = await fn(db);
    await db.commitTransaction();
    if (Capacitor.getPlatform() !== "android" && Capacitor.getPlatform() !== "ios") {
      await sqlite.saveToStore(dbName());
    }
    return result;
  } catch (err) {
    await db.rollbackTransaction();
    throw err;
  }
}

/**
 * Deletes every locally-stored farm database on this device, not just the
 * active one. Logout's privacy promise (see logoutConfirm) is "this
 * device's local data cleared" — since each farm now gets its own
 * persistent database (setActiveFarmId), a device that had switched between
 * multiple farms could otherwise still be holding another farm's data after
 * logging out of this one. Best-effort per database: a failure deleting one
 * name shouldn't block logout from clearing the rest.
 */
export async function wipeAllLocalDatabases(): Promise<void> {
  dbPromise = null;
  const { values } = await sqlite.getDatabaseList();
  // Native returns bare names ("rabbittrack_<farmId>"); jeep-sqlite's web
  // store returns them with its internal "SQLite.db" suffix appended
  // directly (no separator — see Database's dbName construction), so that
  // exact suffix must come off before these names are usable as connection
  // names again, not just the trailing ".db".
  const names = ((values as string[] | undefined) ?? [])
    .map((v) => (v.endsWith("SQLite.db") ? v.slice(0, -"SQLite.db".length) : v))
    .filter((name) => name.startsWith("rabbittrack"));
  for (const name of names) {
    try {
      const isOpen = await sqlite.isConnection(name, false);
      const db = isOpen.result
        ? await sqlite.retrieveConnection(name, false)
        : await sqlite.createConnection(name, false, "no-encryption", 1, false);
      if (!(await db.isDBOpen()).result) {
        await db.open();
      }
      await db.delete();
      await sqlite.closeConnection(name, false);
    } catch (err) {
      console.error("[DB] failed to delete local database", name, err);
    }
  }
}
