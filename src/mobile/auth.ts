/**
 * Client-side auth state for the offline app. The device token from
 * login/register is persisted via Capacitor Preferences (survives WebView
 * storage pressure better than localStorage on Android) and cached in a
 * module variable so syncFetch can read it synchronously.
 *
 * Farm identity note: the local SQLite mirror only ever holds ONE farm's
 * data. Any change of identity — login, register, or switching the active
 * farm — wipes the mirror and reloads, letting the normal bootstrap pull
 * the right farm from the server. That reuses the exact machinery a
 * server-side reset already exercises.
 */
import { Preferences } from "@capacitor/preferences";
import { SYNC_API_BASE_URL } from "./config";
import { withTransaction } from "./db/client";
import { queryAll, run } from "./db/helpers";

const STORAGE_KEY = "rabbittrack.auth";

export type FarmInfo = { farmId: string; role: string; name: string; allowedPages: string[] | null };
export type AuthSession = {
  token: string;
  email: string;
  userName: string | null;
  farms: FarmInfo[];
  activeFarmId: string;
};

let cached: AuthSession | null | undefined; // undefined = not loaded yet

export async function loadSession(): Promise<AuthSession | null> {
  if (cached !== undefined) return cached;
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    cached = value ? (JSON.parse(value) as AuthSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Synchronous read for syncFetch — valid after loadSession() ran at boot. */
export function getSession(): AuthSession | null {
  return cached ?? null;
}

async function persist(session: AuthSession | null): Promise<void> {
  cached = session;
  // Let live UI (app shell nav, account card) react to membership changes.
  window.dispatchEvent(new CustomEvent("auth-session-updated"));
  if (session) {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(session) });
  } else {
    await Preferences.remove({ key: STORAGE_KEY });
  }
}

type AuthResponse = {
  token: string;
  user: { id: string; email: string; name: string | null };
  farms: FarmInfo[];
  error?: string;
};

async function authRequest(path: string, body: Record<string, unknown>): Promise<AuthSession> {
  const res = await fetch(`${SYNC_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as AuthResponse;
  if (!res.ok) throw new Error(data.error ?? `AUTH_FAILED_${res.status}`);

  const session: AuthSession = {
    token: data.token,
    email: data.user.email,
    userName: data.user.name,
    farms: data.farms,
    activeFarmId: data.farms[0]?.farmId ?? "",
  };
  await persist(session);
  return session;
}

export function login(email: string, password: string): Promise<AuthSession> {
  return authRequest("/api/auth/login", { email, password, deviceLabel: navigator.userAgent.slice(0, 80) });
}

export function register(email: string, password: string, name: string): Promise<AuthSession> {
  return authRequest("/api/auth/register", { email, password, name });
}

export async function logout(): Promise<void> {
  const session = getSession();
  if (session) {
    // Best-effort server-side revocation — logging out offline still works.
    fetch(`${SYNC_API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}` },
    }).catch(() => {});
  }
  await persist(null);
  await clearLocalMirror();
}

export async function setActiveFarm(farmId: string): Promise<void> {
  const session = getSession();
  if (!session || session.activeFarmId === farmId) return;
  await persist({ ...session, activeFarmId: farmId });
  await clearLocalMirror();
}

/**
 * Re-fetches the account's LIVE farm memberships — the login response is a
 * snapshot, and an owner may have added this account to their farm since.
 * Returns the updated session (or the cached one when offline). If the
 * active farm's membership was revoked, falls over to the first remaining
 * farm, clears the mirror, and reloads.
 */
export async function refreshFarms(): Promise<AuthSession | null> {
  const session = getSession();
  if (!session) return null;
  try {
    const res = await fetch(`${SYNC_API_BASE_URL}/api/auth/me`, {
      headers: { authorization: `Bearer ${session.token}` },
      cache: "no-store",
    });
    if (res.status === 401) {
      // Token revoked (e.g. from another device) — force re-login.
      await persist(null);
      await clearLocalMirror();
      window.location.reload();
      return null;
    }
    if (!res.ok) return session;
    const data = (await res.json()) as { farms: FarmInfo[] };

    const stillMember = data.farms.some((f) => f.farmId === session.activeFarmId);
    const updated: AuthSession = {
      ...session,
      farms: data.farms,
      activeFarmId: stillMember ? session.activeFarmId : (data.farms[0]?.farmId ?? ""),
    };
    await persist(updated);
    if (!stillMember) {
      await clearLocalMirror();
      window.location.reload();
    }
    return updated;
  } catch {
    return session; // offline — keep the cached snapshot
  }
}

/**
 * Empties every local table (mirror, outbox, cursor) so the next boot
 * bootstraps cleanly for whatever identity is now active. Callers reload
 * the app right after.
 */
export async function clearLocalMirror(): Promise<void> {
  // withTransaction persists to the web platform's IndexedDB store on
  // commit — plain run() calls wouldn't survive a reload there.
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
