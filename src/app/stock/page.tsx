import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { getBreedOptions } from "@/lib/breeds";
import { gramsToKg } from "@/lib/units";
import { QuickRabbitForm, type QuickRabbitRow } from "../rabbits/quick-rabbit-form";

export const metadata = { title: "Stock · RabbitTrack" };

export default async function StockPage() {
  // Pending intake across both sexes: rabbits without a tagId yet ("سلالة").
  // Cage number and weight each autosave independently as soon as they're
  // entered (see saveQuickRabbitCage / saveQuickRabbitWeight) — a rabbit
  // stays here regardless of having a cage/weight, often for months, until
  // someone explicitly clicks "نقل إلى العنبر" (see promoteToHerdPen), which
  // is the only thing that moves her/him on to the pending-mothers/bucks
  // table on /mothers or /bucks to get her/his real number.
  const [rabbits, breedOptions] = await Promise.all([
    prisma.rabbit.findMany({
      where: { tagId: null, movedToHerdPen: false, status: { not: "deceased" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sex: true,
        breed: true,
        cage: true,
        acquiredDate: true,
        weightRecords: {
          orderBy: { date: "desc" },
          take: 1,
          select: { weightGrams: true },
        },
      },
    }),
    getBreedOptions(),
  ]);
  const rows: QuickRabbitRow[] = rabbits.map((r) => ({
    id: r.id,
    sex: r.sex,
    breed: r.breed,
    cage: r.cage,
    date: (r.acquiredDate ?? new Date()).toISOString(),
    weightKg: r.weightRecords[0] ? gramsToKg(r.weightRecords[0].weightGrams) : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="السلالات"
        description="تسجيل سريع للأرانب الصغيرة قبل ترقيتها إلى القطيع برقم ووزن."
      />
      <QuickRabbitForm rows={rows} breedOptions={breedOptions} />
    </div>
  );
}
