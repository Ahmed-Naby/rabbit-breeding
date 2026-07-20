import { ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { RoundsList } from "./rounds-list";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.rounds.title} · RabbitTrack` };
}

export default async function RoundsPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [doesRaw, settings, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        status: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            matingDate: true,
            actualKindlingDate: true,
            buck: { select: { tagId: true } },
            litter: {
              select: { bornAlive: true, bornDead: true, weaned: true, weaningDate: true },
            },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    getDictionary(),
  ]);

  const rt = t.rounds;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader title={rt.title} description={rt.description} />
      )}

      {doesRaw.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={rt.emptyTitle} description={rt.emptyDescription} />
      ) : (
        <RoundsList
          doesRaw={doesRaw}
          settings={settings}
          locale={locale}
        />
      )}
    </div>
  );
}
