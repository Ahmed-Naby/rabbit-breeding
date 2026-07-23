import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { rebreedDueDate, daysUntil, isToday } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, MateCell } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { MatingLog } from "./mating-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.mating.title} · RabbitTrack` };
}

export default async function MatingPage({
  hideHeader,
  todayOnly,
}: {
  hideHeader?: boolean;
  todayOnly?: boolean;
} = {}) {
  // Same eligibility rule as the "تلقيح" button on /does (canMate): فاضية،
  // مرضعة، أو مستبعدة. Filtering it here at the query level (instead of
  // fetching everyone and checking client-side) means this board only ever
  // shows does actually ready right now. MateCell writes through the same
  // startBreeding/markMated actions the does board uses, which already
  // revalidate both "/does" and "/mating" — so the instant a doe is mated
  // here, she's reflected as "ملقحة" on عمليات المزرعة and drops off this list.
  // "سجل التلقيح": a permanent archive of every mating ever recorded on the
  // farm, most recent first — separate from the "ready now" board above.
  // Reads from MatingLog (not Breeding) so a row never disappears just
  // because the doe's cycle later kindles, resorbs, fails, or gets reset.
  const [doesRaw, matingLogRaw, settings, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled", "resting"] },
        doeState: { in: ["empty", "nursing", "excluded"] },
      },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            actualKindlingDate: true,
            buck: { select: { tagId: true } },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    prisma.matingLog.findMany({
      orderBy: { matingDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        wasNursingAtMating: true,
        doe: { select: { id: true, tagId: true, breed: true } },
        buck: { select: { tagId: true } },
      },
    }),
    getSettings(),
    getDictionary(),
  ]);

  // For plain "nursing" (not nursing_bred/nursing_pregnant — already excluded
  // from the query above since those mean she's already been rebred), the
  // latest breeding row (take: 1) is always her kindling row. A nursing doe
  // only counts as ready once the configured rebreed system's cooldown since
  // that kindling has elapsed (0/15/30 days, set in الإعدادات).
  const does = doesRaw.filter((doe) => {
    if (doe.doeState !== "nursing") return true;
    const kindlingDate = doe.breedingsAsDoe[0]?.actualKindlingDate;
    if (!kindlingDate) return true;
    return daysUntil(rebreedDueDate(kindlingDate, settings.rebreedAfterKindlingDays)) <= 0;
  });
  const matingLog = todayOnly ? matingLogRaw.filter((row) => isToday(row.matingDate)) : matingLogRaw;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader
          title={t.mating.title}
          description={t.mating.description(does.length)}
        />
      )}

      {does.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title={t.mating.emptyTitle}
          description={t.mating.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.mating.colIndex, className: "text-center", sortable: false },
              { key: "tag", label: t.mating.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.mating.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "doeState", label: t.mating.colDoeState, type: "string", className: "text-center" },
              { key: "mate", label: t.mating.colMate, className: "text-center", sortable: false },
            ]}
            rows={does.map((doe, i) => {
              const b = doe.breedingsAsDoe[0];
              return {
                key: doe.id,
                sortValues: { tag: doe.tagId, breed: doe.breed, doeState: doe.doeState },
                node: (
                  <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                        {doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{doe.breed ?? "—"}</TableCell>
                    <TableCell>
                      <DoeStateBadge current={doe.doeState} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <MateCell
                        breedingId={b?.id ?? null}
                        doeId={doe.id}
                        canMate
                        buckTagId={b?.buck?.tagId ?? null}
                        locale={locale}
                      />
                    </TableCell>
                  </TableRow>
                ),
              };
            })}
          />
        </div>
      )}

      <MatingLog matingLog={matingLog} locale={locale} t={t.mating} todayOnly={todayOnly} />
    </div>
  );
}
