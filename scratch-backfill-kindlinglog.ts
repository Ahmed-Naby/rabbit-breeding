import { prisma } from "@/lib/prisma";

async function main() {
  const breedings = await prisma.breeding.findMany({
    where: { actualKindlingDate: { not: null } },
    select: { id: true, doeId: true, buckId: true, matingDate: true, actualKindlingDate: true },
  });

  console.log(`Found ${breedings.length} breedings with actualKindlingDate set.`);

  let created = 0;
  for (const b of breedings) {
    await prisma.kindlingLog.create({
      data: {
        doeId: b.doeId,
        buckId: b.buckId,
        matingDate: b.matingDate,
        kindlingDate: b.actualKindlingDate!,
      },
    });
    created++;
  }

  console.log(`Backfilled ${created} KindlingLog rows.`);
}

main().finally(() => prisma.$disconnect());
