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
