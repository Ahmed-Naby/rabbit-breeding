import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { getBreedOptions } from "@/lib/breeds";
import { gramsToKg } from "@/lib/units";
import { QuickRabbitForm, type QuickRabbitRow } from "../rabbits/quick-rabbit-form";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.stock.title} · RabbitTrack` };
}

export default async function StockPage() {
  // Pending intake across both sexes: rabbits without a tagId yet ("سلالة").
  // Cage number and weight each autosave independently as soon as they're
  // entered (see saveQuickRabbitCage / saveQuickRabbitWeight) — a rabbit
  // stays here regardless of having a cage/weight, often for months, until
  // someone explicitly clicks "نقل إلى العنبر" (see promoteToHerdPen), which
  // is the only thing that moves her/him on to the pending-mothers/bucks
  // table on /mothers or /bucks to get her/his real number.
  const [rabbits, breedOptions, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { tagId: null, movedToHerdPen: false, status: { notIn: ["deceased", "culled"] } },
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
    getDictionary(),
  ]);
  const rows: QuickRabbitRow[] = rabbits.map((r) => ({
    id: r.id,
    sex: r.sex,
    breed: r.breed,
    cage: r.cage,
    date: (r.acquiredDate ?? new Date()).toISOString(),
    weightKg: r.weightRecords[0] ? gramsToKg(r.weightRecords[0].weightGrams) : null,
  }));

  const headerTitle = (
    <div className="flex items-center gap-3 animate-fade-in-up">
      <span>{t.stock.title}</span>
      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
        {rabbits.length}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={headerTitle} description={t.stock.description} />
      <QuickRabbitForm
        rows={rows}
        breedOptions={breedOptions}
        t={t.stock}
        tCommon={t.common}
        locale={locale}
      />
    </div>
  );
}
