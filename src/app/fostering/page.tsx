import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import { FosterForm } from "./foster-form";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.fostering.title} · RabbitTrack` };
}

export default async function FosteringPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [logs, { locale, t }] = await Promise.all([
    prisma.fosterLog.findMany({
      include: {
        fromDoe: { select: { id: true, tagId: true } },
        toDoe: { select: { id: true, tagId: true } },
      },
      orderBy: { date: "desc" },
    }),
    getDictionary(),
  ]);

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader title={t.fostering.pageTitle} description={t.fostering.description} />
      )}

      <FosterForm locale={locale} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.fostering.logTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={HeartHandshake}
                title={t.fostering.emptyTitle}
                description={t.fostering.emptyDescription}
              />
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Link href={`/rabbits/${log.fromDoe.id}`} className="hover:underline">
                      {log.fromDoe.tagId ?? t.dashboard.stockFallback}
                    </Link>
                    <span className="text-muted-foreground">→</span>
                    <Link href={`/rabbits/${log.toDoe.id}`} className="hover:underline">
                      {log.toDoe.tagId ?? t.dashboard.stockFallback}
                    </Link>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium tabular-nums">
                      {t.fostering.kitsUnit(log.count)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <LocalDate date={log.date} locale={locale} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
