import { createContext, useContext } from "react";

/**
 * Whether the page reading this is the one currently on screen.
 *
 * The shell keeps every page a farmer has opened mounted and hides the
 * inactive ones, so «الأمهات» comes back instantly instead of re-reading two
 * hundred does from SQLite each time it is reached. The cost of that is a
 * roomful of live pages listening for the same events, so anything that costs
 * a database read asks here first — see useDbRefresh, which stays quiet while
 * hidden and catches up the moment its page is shown again.
 *
 * Defaults to true so a page rendered outside the shell (tests, a nested tab
 * component) behaves exactly as it did before this existed.
 */
export const PageVisibleContext = createContext(true);

export function useIsPageVisible(): boolean {
  return useContext(PageVisibleContext);
}
