import "server-only";
import { prisma } from "@/lib/prisma";
import type { Option } from "@/components/form-fields";
import { compareTagId } from "@/lib/utils";

/**
 * Candidate sires/dams for the rabbit form. Bucks can sire, does can bear;
 * unknown-sex rabbits appear in both lists. Excludes the rabbit being edited.
 * Only promoted rabbits (has a tagId) are valid parents — a tagId-less
 * "سلالة" isn't identified enough yet to be picked as a sire/dam.
 */
export async function getParentOptions(
  excludeId?: string
): Promise<{ buckOptions: Option[]; doeOptions: Option[] }> {
  const rabbitsRaw = await prisma.rabbit.findMany({
    where: {
      tagId: { not: null },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
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
    if (r.sex === "buck" || r.sex === "unknown") buckOptions.push(opt);
    if (r.sex === "doe" || r.sex === "unknown") doeOptions.push(opt);
  }
  return { buckOptions, doeOptions };
}
