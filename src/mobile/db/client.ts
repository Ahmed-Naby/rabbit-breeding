import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";

// Bundled as a raw string by the mobile build (see vite.config.mobile.ts,
// Phase 3) rather than fetched at runtime — schema.sql only ever needs
// reading once, at first-open, via `applySchema` below.
import schemaSql from "./schema.sql?raw";

export const DB_NAME = "rabbittrack";

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
  console.log("[DB] openConnection starting");
  await initWebStoreIfNeeded();

  // On native (Android/iOS) the plugin's connection map lives in the Activity
  // and survives a WebView reload — which login, register, and farm-switch all
  // trigger (window.location.reload()). The JS-side SQLiteConnection, however,
  // is recreated empty on reload, so isConnection() reports "none" while
  // createConnection() then throws "Connection <name> already exists".
  // checkConnectionsConsistency() reconciles the JS and native maps (closing
  // the orphaned native connection) so the create/retrieve below is correct.
  try {
    await sqlite.checkConnectionsConsistency();
  } catch {
    // Nothing to reconcile on a first-ever open — safe to ignore.
  }

  console.log("[DB] checking if connection exists");
  const alreadyOpen = await sqlite.isConnection(DB_NAME, false);
  console.log("[DB] connection check result:", alreadyOpen.result);
  let db: SQLiteDBConnection;
  if (alreadyOpen.result) {
    db = await sqlite.retrieveConnection(DB_NAME, false);
  } else {
    try {
      db = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
    } catch {
      // Belt-and-suspenders: if a stale native connection still exists despite
      // the reconcile above, reuse it rather than failing the whole boot.
      db = await sqlite.retrieveConnection(DB_NAME, false);
    }
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
    await sqlite.saveToStore(DB_NAME);
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
  const isOpen = await sqlite.isConnection(DB_NAME, false);
  if (isOpen.result) {
    await sqlite.closeConnection(DB_NAME, false);
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
      await sqlite.saveToStore(DB_NAME);
    }
    return result;
  } catch (err) {
    await db.rollbackTransaction();
    throw err;
  }
}
