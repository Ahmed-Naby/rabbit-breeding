import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { FosterForm } from "./foster-form";
import { FosterCandidates } from "./foster-candidates";
import { FosteringLog } from "./fostering-log";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getSettings } from "@/lib/settings";
import { isToday } from "@/lib/dates";
import { fosterWindowStart, splitFosterCandidates, type FosterCandidate } from "@/lib/fostering";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.fostering.title} · RabbitTrack` };
}

export default async function FosteringPage({
  hideHeader,
  todayOnly,
}: {
  hideHeader?: boolean;
  todayOnly?: boolean;
} = {}) {
  const [logsRaw, settings, { locale, t }] = await Promise.all([
    prisma.fosterLog.findMany({
      include: {
        fromDoe: { select: { id: true, tagId: true } },
        toDoe: { select: { id: true, tagId: true } },
      },
      orderBy: { date: "desc" },
    }),
    getSettings(),
    getDictionary(),
  ]);
  const logs = todayOnly ? logsRaw.filter((log) => isToday(log.date)) : logsRaw;

  // Fresh, still-nursing litters — the only ones kits can be moved between.
  const litters = await prisma.litter.findMany({
    where: {
      kindlingDate: { gte: fosterWindowStart(settings.fosterWindowDays) },
      weaningDate: null,
    },
    select: {
      kindlingDate: true,
      bornAlive: true,
      breeding: {
        select: { doe: { select: { id: true, tagId: true, cage: true, status: true } } },
      },
    },
  });
  const candidates: FosterCandidate[] = litters
    .filter((l) => l.breeding.doe.status === "active")
    .map((l) => ({
      doeId: l.breeding.doe.id,
      tagId: l.breeding.doe.tagId,
      cage: l.breeding.doe.cage,
      kindlingDate: l.kindlingDate,
      kits: l.bornAlive,
    }));
  const { large, small } = splitFosterCandidates(
    candidates,
    settings.fosterHighKits,
    settings.fosterLowKits
  );

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader title={t.fostering.pageTitle} description={t.fostering.description} />
      )}

      <FosterCandidates
        large={large}
        small={small}
        windowDays={settings.fosterWindowDays}
        highKits={settings.fosterHighKits}
        lowKits={settings.fosterLowKits}
        locale={locale}
        t={t.fostering}
      />

      <FosterForm locale={locale} />

      <FosteringLog logs={logs} locale={locale} t={t} todayOnly={todayOnly} />
    </div>
  );
}
