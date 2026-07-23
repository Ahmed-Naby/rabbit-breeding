import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { expectedKindling, isToday } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import type { DoeState } from "@/lib/enums";
import { DoeStateBadge, KindleButton } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isKindlingCandidate } from "@/lib/breeding-filters";
import { KindlingLog } from "./kindling-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.kindling.title} · RabbitTrack` };
}

export default async function KindlingPage({
  hideHeader,
  todayOnly,
}: {
  hideHeader?: boolean;
  todayOnly?: boolean;
} = {}) {
  // "pregnant" / "nursing_pregnant" = confirmed pregnant, kindling not yet
  // recorded for this cycle (matches KindleButton's own `active` condition).
  const [candidates, settings, kindlingLogRaw, litters, breedings, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["pregnant", "nursing_pregnant"] },
      },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, matingDate: true, buck: { select: { tagId: true } } },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    // Permanent, append-only log — written once by markKindled and never
    // touched again, so births survive even after the underlying Breeding
    // row is reused for the doe's next mating.
    prisma.kindlingLog.findMany({
      orderBy: { kindlingDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        kindlingDate: true,
        doe: { select: { id: true, tagId: true, breed: true } },
        buck: { select: { tagId: true } },
      },
    }),
    // bornAlive/bornDead/weaned live on Litter (keyed to Breeding, which gets
    // reused/overwritten on rebreeding), not on KindlingLog — matched below
    // by doe + calendar day, so a birth's counts only show up here as long as
    // its Litter row hasn't since been recycled by a later cycle.
    prisma.litter.findMany({
      select: {
        kindlingDate: true,
        bornAlive: true,
        bornDead: true,
        breeding: { select: { doeId: true } },
      },
    }),
    // Matched by doe + calendar day (same best-effort join as litters below)
    // so "أحياء"/"نافق" can be entered inline in the log without needing a
    // breedingId on KindlingLog itself — the row's Breeding may since have
    // been reused for a later mating, in which case no input is shown.
    prisma.breeding.findMany({
      where: { actualKindlingDate: { not: null } },
      select: { id: true, doeId: true, actualKindlingDate: true },
    }),
    getDictionary(),
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const b = doe.breedingsAsDoe[0];
      if (!b || !isKindlingCandidate({ ...b, actualKindlingDate: null }, settings.gestationDays, today)) return null;
      const dueDate = expectedKindling(new Date(b.matingDate!), settings.gestationDays);
      return { doe, b, dueDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const kindlingLog = todayOnly ? kindlingLogRaw.filter((row) => isToday(row.kindlingDate)) : kindlingLogRaw;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader
          title={t.kindling.title}
          description={t.kindling.description(does.length, settings.gestationDays)}
        />
      )}

      {does.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title={t.kindling.emptyTitle}
          description={t.kindling.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.kindling.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.kindling.colDoeTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.kindling.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.kindling.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "matingDate", label: t.kindling.colMatingDate, type: "date", className: "text-center" },
              { key: "dueDate", label: t.kindling.colExpectedKindling, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "doeState", label: t.kindling.colDoeState, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "kindle", label: t.kindling.colKindle, className: "text-center", sortable: false },
            ]}
            rows={does.map(({ doe, b, dueDate }, i) => ({
              key: doe.id,
              sortValues: {
                doeTag: doe.tagId,
                breed: doe.breed,
                buckTag: b.buck?.tagId,
                matingDate: b.matingDate,
                dueDate,
                doeState: doe.doeState,
              },
              node: (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{doe.breed ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{b.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={b.matingDate} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <LocalDate date={dueDate} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <KindleButton
                      breedingId={b.id}
                      doeId={doe.id}
                      text={t.kindling.kindleButton}
                      doeState={doe.doeState as DoeState}
                      locale={locale}
                    />
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}

      <KindlingLog kindlingLog={kindlingLog} litters={litters} breedings={breedings} locale={locale} t={t.kindling} todayOnly={todayOnly} />
    </div>
  );
}
