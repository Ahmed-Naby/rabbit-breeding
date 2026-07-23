import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type FosteringLogRow = {
  id: string;
  date: Date;
  count: number;
  fromDoe: { id: string; tagId: string | null };
  toDoe: { id: string; tagId: string | null };
};

/** "سجل التبني": every recorded foster transfer, most recent first. */
export function FosteringLog({
  logs,
  locale,
  t,
  todayOnly,
}: {
  logs: FosteringLogRow[];
  locale: Locale;
  t: Dictionary;
  todayOnly?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t.fostering.logTitle}
          {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={HeartHandshake} title={t.fostering.emptyTitle} description={t.fostering.emptyDescription} />
          </div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
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
                  <span className="font-medium tabular-nums">{t.fostering.kitsUnit(log.count)}</span>
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
  );
}
