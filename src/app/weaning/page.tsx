import Link from "next/link";
import { Milk } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { weaningDueDate, isToday } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, WeanButton } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveNursingLitterRow, isWeaningCandidate } from "@/lib/breeding-filters";
import { WeaningLog } from "./weaning-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.weaning.title} · RabbitTrack` };
}

export default async function WeaningPage({
  hideHeader,
  todayOnly,
}: {
  hideHeader?: boolean;
  todayOnly?: boolean;
} = {}) {
  // Only doeStates that can carry an unweaned litter (see does/page.tsx's
  // weanActive logic). "مرضعة و ملقحة/عشار" rebred while still nursing, so
  // her latest breeding row is the new cycle (no litter yet) — the ongoing,
  // not-yet-weaned litter still lives on the *previous* row, hence take: 2.
  const [candidates, settings, weaningLogRaw, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["nursing", "nursing_bred", "nursing_pregnant"] },
      },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            actualKindlingDate: true,
            buck: { select: { tagId: true } },
            litter: { select: { weaningDate: true, bornAlive: true, bornDead: true } },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    // "سجل الفطام": a permanent, append-only log — written once at weaning and
    // never edited/deleted (عدد الفطام/وزن الفطام are mirrored in one-way from
    // the does board), so weanings survive the Litter row being recycled.
    prisma.weaningLog.findMany({
      orderBy: { weaningDate: "desc" },
      select: {
        id: true,
        kindlingDate: true,
        weaningDate: true,
        bornAlive: true,
        bornDead: true,
        weaned: true,
        weaningWeightGrams: true,
        doe: { select: { id: true, tagId: true, breed: true } },
        buck: { select: { tagId: true } },
      },
    }),
    getDictionary(),
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const litterRow = resolveNursingLitterRow(doe.breedingsAsDoe);
      if (!litterRow || !isWeaningCandidate(litterRow, settings.weaningDays, today)) return null;
      const dueDate = weaningDueDate(new Date(litterRow.actualKindlingDate!), settings.weaningDays);
      return { doe, litterRow, dueDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const weaningLog = todayOnly
    ? weaningLogRaw.filter((row) => isToday(row.weaningDate))
    : weaningLogRaw;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader
          title={t.weaning.title}
          description={t.weaning.description(does.length, settings.weaningDays)}
        />
      )}

      {does.length === 0 ? (
        <EmptyState
          icon={Milk}
          title={t.weaning.emptyTitle}
          description={t.weaning.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.weaning.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.weaning.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.weaning.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.weaning.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "kindlingDate", label: t.weaning.colKindlingDate, type: "date", className: "text-center" },
              { key: "dueDate", label: t.weaning.colExpectedWeaningDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "doeState", label: t.weaning.colDoeState, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "alive", label: t.weaning.colAlive, type: "number", className: "text-center" },
              { key: "dead", label: t.weaning.colDead, type: "number", className: "text-center" },
              { key: "wean", label: t.weaning.colWean, className: "text-center", sortable: false },
            ]}
            rows={does.map(({ doe, litterRow, dueDate }, i) => ({
              key: doe.id,
              sortValues: {
                doeTag: doe.tagId,
                breed: doe.breed,
                buckTag: litterRow.buck?.tagId,
                kindlingDate: litterRow.actualKindlingDate,
                dueDate,
                doeState: doe.doeState,
                alive: litterRow.litter?.bornAlive,
                dead: litterRow.litter?.bornDead,
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
                  <TableCell className="hidden sm:table-cell">{litterRow.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={litterRow.actualKindlingDate} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <LocalDate date={dueDate} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                  <TableCell>{litterRow.litter?.bornAlive ?? "—"}</TableCell>
                  <TableCell>{litterRow.litter?.bornDead ?? "—"}</TableCell>
                  <TableCell>
                    <WeanButton
                      breedingId={litterRow.id}
                      doeId={doe.id}
                      text={t.weaning.weanButton}
                      active
                      weaned={false}
                      locale={locale}
                    />
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}

      <WeaningLog weaningLog={weaningLog} locale={locale} t={t.weaning} todayOnly={todayOnly} />
    </div>
  );
}
