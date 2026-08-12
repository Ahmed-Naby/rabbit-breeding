import type { SQLiteDBConnection } from "@capacitor-community/sqlite";

export async function queryAll<T>(db: SQLiteDBConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query(sql, params);
  return (res.values ?? []) as T[];
}

export async function queryOne<T>(db: SQLiteDBConnection, sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await queryAll<T>(db, sql, params);
  return rows[0] ?? null;
}

export async function run(db: SQLiteDBConnection, sql: string, params: unknown[] = []): Promise<void> {
  await db.run(sql, params, false);
}

/**
 * SQLite's ceiling on `?` placeholders in one statement. Older builds — and
 * Android ships whatever its system SQLite is — cap at 999, so chunk well
 * under it rather than discovering the limit on someone's phone.
 */
const MAX_PARAMS = 500;

/**
 * One query for a whole list of ids, instead of one query per id.
 *
 * This is the shape most of this file used to be written in: fetch the parent
 * rows, then loop over them asking for each one's children. It reads naturally
 * and it is ruinous on Android, where every single query crosses the Capacitor
 * bridge between JavaScript and native code — a few milliseconds each, paid
 * even when the SQL itself is instant. A doe board of 200 does cost roughly a
 * thousand crossings and several seconds of staring at an empty screen. The
 * same data comes back in one crossing when it's asked for at once.
 *
 * `buildSql` receives the placeholder list ("?, ?, ?") so the caller keeps
 * ownership of its own SQL. Ids are deduplicated, empty input skips the round
 * trip entirely, and anything above MAX_PARAMS is split across statements.
 */
export async function queryIn<T>(
  db: SQLiteDBConnection,
  buildSql: (placeholders: string) => string,
  ids: readonly (string | number)[],
  buildParams: (chunk: (string | number)[]) => unknown[] = (chunk) => chunk
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const out: T[] = [];
  for (let i = 0; i < unique.length; i += MAX_PARAMS) {
    const chunk = unique.slice(i, i + MAX_PARAMS);
    const sql = buildSql(chunk.map(() => "?").join(", "));
    out.push(...(await queryAll<T>(db, sql, buildParams(chunk))));
  }
  return out;
}

/** Rows bucketed by key, preserving the order the query returned them in. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** One row per key. First occurrence wins, so order the query accordingly. */
export function indexBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, row);
  }
  return map;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today at UTC midnight, ISO-formatted — matches the server ops' date stamping (setUTCHours(0,0,0,0)). */
export function todayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Convert a yyyy-MM-dd <input type="date"> value to a UTC-midnight ISO string,
 * matching todayIso()'s format so a hand-picked mating date is stored the same
 * way as a "today" stamp (and the same way the server stores it).
 */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
