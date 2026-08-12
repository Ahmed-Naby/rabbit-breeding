import { useEffect, useRef } from "react";

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
 */
export function useDbRefresh(refresh: () => void | Promise<void>): void {
  const latest = useRef(refresh);

  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    const handler = () => {
      void latest.current();
    };
    window.addEventListener("local-db-updated", handler);
    return () => window.removeEventListener("local-db-updated", handler);
  }, []);
}
