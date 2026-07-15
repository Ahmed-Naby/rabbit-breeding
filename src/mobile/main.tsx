import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Capacitor } from "@capacitor/core";
import { AppShell } from "./app-shell";
import { attachNetworkListener, syncNow } from "./sync/sync-manager";
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

  attachNetworkListener();
  void syncNow();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppShell />
      <Toaster richColors position="top-center" />
    </StrictMode>
  );
}

void bootstrap();
