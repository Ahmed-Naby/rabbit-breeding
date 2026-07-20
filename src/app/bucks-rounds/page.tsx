import { ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { BucksRoundsList } from "./bucks-rounds-list";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.bucksRounds.title} · RabbitTrack` };
}

export default async function BucksRoundsPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [bucks, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: { id: true, tagId: true, breed: true, status: true },
      orderBy: { tagId: "asc" },
    }),
    getDictionary(),
  ]);

  const rt = t.bucksRounds;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader title={rt.title} description={rt.description} />
      )}

      {bucks.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={rt.emptyTitle} description={rt.emptyDescription} />
      ) : (
        <BucksRoundsList
          bucks={bucks}
          locale={locale}
        />
      )}
    </div>
  );
}
