import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { FosterForm } from "./foster-form";
import { FosteringLog } from "./fostering-log";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isToday } from "@/lib/dates";

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
  const [logsRaw, { locale, t }] = await Promise.all([
    prisma.fosterLog.findMany({
      include: {
        fromDoe: { select: { id: true, tagId: true } },
        toDoe: { select: { id: true, tagId: true } },
      },
      orderBy: { date: "desc" },
    }),
    getDictionary(),
  ]);
  const logs = todayOnly ? logsRaw.filter((log) => isToday(log.date)) : logsRaw;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader title={t.fostering.pageTitle} description={t.fostering.description} />
      )}

      <FosterForm locale={locale} />

      <FosteringLog logs={logs} locale={locale} t={t} todayOnly={todayOnly} />
    </div>
  );
}
