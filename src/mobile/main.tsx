import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Capacitor } from "@capacitor/core";
import { AppShell } from "./app-shell";
import { attachNetworkListener, attachAppLifecycleSync, syncNow } from "./sync/sync-manager";
import { loadSession, refreshFarms } from "./auth";
import "@/app/globals.css";

/**
 * On the web platform (browser dev preview — no native SQLite plugin backing
 * it), capacitor-community/sqlite stores data via a `<jeep-sqlite>` custom
 * element wired to IndexedDB. It must be defined and present in the DOM
 * before db/client.ts's first `getDb()` call (its `initWebStoreIfNeeded`
 * calls `sqlite.initWebStore()`, which requires this). Native Android needs
 * none of this — the plugin talks to a real SQLite file directly.
 */
async function ensureWebSqliteStore(): Promise<void> {
  if (Capacitor.getPlatform() === "android" || Capacitor.getPlatform() === "ios") return;
  const { defineCustomElements } = await import("jeep-sqlite/loader");
  defineCustomElements(window);
  if (!document.querySelector("jeep-sqlite")) {
    document.body.appendChild(document.createElement("jeep-sqlite"));
  }
  await customElements.whenDefined("jeep-sqlite");
}

async function bootstrap() {
  await ensureWebSqliteStore();

  // Load the stored device token BEFORE anything syncs, so syncFetch's very
  // first request already carries the Bearer header. Sync only starts for a
  // logged-in device — a fresh install sits on the login screen instead of
  // legacy-syncing the default farm it has no business seeing.
  const session = await loadSession();
  if (session) {
    attachNetworkListener();
    attachAppLifecycleSync();
    void syncNow();
    // Best-effort background refresh of farm memberships — picks up being
    // added to (or removed from) a farm since login without re-logging-in.
    void refreshFarms();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppShell />
      <Toaster richColors position="top-center" />
    </StrictMode>
  );
}

void bootstrap();
