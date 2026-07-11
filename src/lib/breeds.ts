import "server-only";
import { prisma } from "./prisma";
import type { Option } from "@/components/form-fields";

/** Registered breed names for the "النوع" dropdown, uncached so a freshly added breed shows up immediately. */
export async function getBreedOptions(): Promise<Option[]> {
  const breeds = await prisma.breed.findMany({ orderBy: { name: "asc" } });
  return breeds.map((b) => ({ value: b.name, label: b.name }));
}
