import { useEffect, useRef } from "react";
import { useIsPageVisible } from "./page-visibility";

/**
 * Re-read the local database when a sync brings down new data.
 *
 * The app shell used to answer that event by remounting the whole page
 * (`<main key={dbVersion}>`), which did refresh the numbers but threw away
 * everything the page was holding: the open tab, the chosen dates, the scroll
 * position, a half-filled form. A sync that arrives while someone is reading a
 * filtered report should change the figures, not the screen.
 *
 * So each page calls this with its own loader instead. Same trigger, same
 * queries — minus the teardown, and minus the loading flash that came with it.
 *
 * The callback is held in a ref, so an inline arrow is fine at the call site:
 * the listener is attached once and never re-subscribes on re-render.
 *
 * Hidden pages stay quiet. The shell keeps every page a farmer has opened
 * mounted (that is what makes going back to «الأمهات» instant), so a sync
 * would otherwise set a dozen off-screen boards querying at once — the phone
 * would stutter for data nobody is looking at. Instead the refresh is deferred
 * to the moment the page is shown again, which also covers the other way data
 * goes stale in the background: a press on some *other* page that edited the
 * same rows without any sync involved.
 */
export function useDbRefresh(refresh: () => void | Promise<void>): void {
  const latest = useRef(refresh);
  const visible = useIsPageVisible();
  // Starts true so the page that is on screen at mount doesn't immediately
  // re-run the load its own effect just started.
  const wasVisible = useRef(visible);

  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (!wasVisible.current) {
      wasVisible.current = true;
      // Shown again: repaint from what's already in state, then quietly
      // correct it. No skeleton — the numbers change, the screen doesn't.
      void latest.current();
    }
    const handler = () => {
      void latest.current();
    };
    window.addEventListener("local-db-updated", handler);
    return () => window.removeEventListener("local-db-updated", handler);
  }, [visible]);
}
