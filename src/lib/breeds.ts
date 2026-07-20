import "server-only";
import { prisma } from "./prisma";
import type { Option } from "@/components/form-fields";

/** Registered breed names for the "النوع" dropdown, uncached so a freshly added breed shows up immediately. */
export async function getBreedOptions(): Promise<Option[]> {
  const [breeds, rabbitBreeds] = await Promise.all([
    prisma.breed.findMany({ select: { name: true } }),
    prisma.rabbit.findMany({
      where: { breed: { not: null } },
      select: { breed: true },
      distinct: ["breed"],
    }),
  ]);

  const set = new Set<string>();
  for (const b of breeds) if (b.name) set.add(b.name);
  for (const r of rabbitBreeds) if (r.breed) set.add(r.breed);

  const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  return sorted.map((name) => ({ value: name, label: name }));
}
