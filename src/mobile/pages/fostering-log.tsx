import { HeartHandshake } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { LocalFosterLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { PagedList } from "@/components/ui/table-pager";

export function FosteringLog({
  logs,
  t,
  locale,
  todayOnly,
}: {
  logs: LocalFosterLogEntry[];
  t: Dictionary;
  locale?: Locale;
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
            <EmptyState
              icon={HeartHandshake}
              title={t.fostering.emptyTitle}
              description={t.fostering.emptyDescription}
            />
          </div>
        ) : (
          <PagedList
            locale={locale ?? "ar"}
            className="divide-y"
            items={logs.map((log) => ({
              key: log.id,
              node: (
                <div key={log.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{log.fromDoeTag ?? t.dashboard.stockFallback}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-bold">{log.toDoeTag ?? t.dashboard.stockFallback}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium tabular-nums">{t.fostering.kitsUnit(log.count)}</span>
                    <span className="text-xs text-muted-foreground">
                      <LocalDate date={new Date(log.date)} />
                    </span>
                  </div>
                </div>
              ),
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
