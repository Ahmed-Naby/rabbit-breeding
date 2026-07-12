import "server-only";
import { getLocale } from "./cookie";
import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";

const dictionaries = { ar, en };

export async function getDictionary() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
