import "server-only";
import { prisma } from "@/lib/prisma";
import type { Option } from "@/components/form-fields";
import { compareTagId } from "@/lib/utils";

/**
 * Breeding stock for the mating form: active/reference, promoted (has a
 * tagId) rabbits, split by sex. Unknown-sex and tagId-less "سلالة" rabbits
 * are excluded — a mating needs a known, identified buck+doe.
 */
export async function getBreedingStock(): Promise<{
  buckOptions: Option[];
  doeOptions: Option[];
}> {
  const rabbitsRaw = await prisma.rabbit.findMany({
    where: { status: { in: ["active", "reference"] }, tagId: { not: null } },
    select: { id: true, tagId: true, sex: true },
  });
  const rabbits = rabbitsRaw.filter(
    (r): r is typeof r & { tagId: string } => r.tagId !== null
  );
  rabbits.sort((a, b) => compareTagId(a.tagId, b.tagId));

  const buckOptions: Option[] = [];
  const doeOptions: Option[] = [];
  for (const r of rabbits) {
    const opt = { value: r.id, label: r.tagId };
    if (r.sex === "buck") buckOptions.push(opt);
    if (r.sex === "doe") doeOptions.push(opt);
  }
  return { buckOptions, doeOptions };
}
