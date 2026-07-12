import { ar, type Dictionary } from "./ar";
import { en } from "./en";
import type { Locale } from "../locales";

const dictionaries: Record<Locale, Dictionary> = { ar, en };

/**
 * Client Components can't receive `t` as a prop from a Server Component when
 * a namespace contains function-valued (interpolated) strings — functions
 * can't cross the RSC boundary. Client Components that need translations
 * import this instead and derive `t` locally from a plain `locale` prop.
 */
export function getClientDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
