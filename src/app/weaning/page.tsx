import Link from "next/link";
import { Milk } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { weaningDueDate, isToday } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import {
  DoeStateBadge,
  WeanButton,
  LitterCountInput,
  LitterWeightInput,
} from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveNursingLitterRow, isWeaningCandidate } from "@/lib/breeding-filters";
import { weaningEntryComplete } from "@/lib/does-board";
import { deadDuringBreeding, resolveBornDeadAtKindling } from "@/lib/kit-mortality";
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
            litter: {
              select: {
                weaningDate: true,
                bornAlive: true,
                bornDead: true,
                // Typed in on this page now, before "فطام" is pressed — see the
                // two input columns below.
                weaned: true,
                weaningWeightGrams: true,
              },
            },
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
        // Feeds «نسبة بقاء الفطام» — see weaningSurvivalRate in kit-mortality.ts.
        bornDeadAtKindling: true,
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

  // «نافق» on this board means kits lost *during nursing*, and the Litter row
  // can't tell you that on its own — its bornDead is stillborns + nursing
  // deaths added together. The frozen stillborn count lives on KindlingLog, so
  // it's read here: one query for the whole board rather than one per doe.
  const kindlingRows =
    does.length === 0
      ? []
      : await prisma.kindlingLog.findMany({
          where: { breedingId: { in: does.map(({ litterRow }) => litterRow.id) } },
          // Newest first, so the first row per breedingId is the cycle on
          // screen — a reused Breeding row carries one KindlingLog per cycle,
          // and kindlingDate is a date (not a timestamp), so createdAt breaks
          // a same-day tie. Same ordering as breeding-ops.ts.
          orderBy: [{ kindlingDate: "desc" }, { createdAt: "desc" }],
          select: { breedingId: true, bornDeadAtKindling: true },
        });
  const stillbornByBreeding = new Map<string, number>();
  for (const k of kindlingRows) {
    if (k.breedingId && !stillbornByBreeding.has(k.breedingId)) {
      stillbornByBreeding.set(k.breedingId, k.bornDeadAtKindling);
    }
  }

  // Second road for the cycles that first one couldn't answer: KitDeathLog
  // holds the nursing deaths directly, one dated row per «تسجيل نافق» press.
  // See resolveBornDeadAtKindling for why the two roads meet at the same
  // number, and why zero rows must stay «—» rather than become zero deaths.
  const unresolved = does.filter(
    ({ litterRow }) => (stillbornByBreeding.get(litterRow.id) ?? -1) < 0 && litterRow.actualKindlingDate
  );
  const deathRows =
    unresolved.length === 0
      ? []
      : await prisma.kitDeathLog.groupBy({
          by: ["doeId", "kindlingDate"],
          where: {
            OR: unresolved.map(({ doe, litterRow }) => ({
              doeId: doe.id,
              kindlingDate: litterRow.actualKindlingDate,
            })),
          },
          _sum: { count: true },
        });
  const cycleKey = (doeId: string, kindlingDate: Date | null) =>
    `${doeId}|${kindlingDate?.getTime() ?? 0}`;
  const deathsByCycle = new Map<string, number>(
    deathRows.map((r) => [cycleKey(r.doeId, r.kindlingDate), r._sum.count ?? 0])
  );

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
            initialSortKey="doeTag"
            // Same banner as سجل الفطام: أحياء + نافق are the kits under her
            // care right now, so they add up. Spans must stay in step with
            // `columns` below, fillers carrying their columns' responsive
            // classes so the two header rows line up on a phone.
            columnGroups={[
              { span: 2 },
              { span: 2, className: "hidden sm:table-cell" },
              { span: 1 },
              { span: 2, className: "hidden sm:table-cell" },
              { label: t.weaning.groupNursingCount, span: 2, className: "font-semibold" },
              { span: 3 },
            ]}
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
              { key: "weanedCount", label: t.weaning.colWeanedCount, type: "number", className: "text-center" },
              { key: "weaningWeight", label: t.weaning.colWeaningWeight, type: "number", className: "text-center" },
              { key: "wean", label: t.weaning.colWean, className: "text-center", sortable: false },
            ]}
            rows={does.map(({ doe, litterRow, dueDate }, i) => {
              // Nursing deaths only — see the two maps built above. 0 (rendered
              // «—») when neither road can supply the number.
              const dead = litterRow.litter
                ? deadDuringBreeding({
                    bornDead: litterRow.litter.bornDead,
                    bornDeadAtKindling: resolveBornDeadAtKindling({
                      fromKindlingLog: stillbornByBreeding.get(litterRow.id),
                      bornDead: litterRow.litter.bornDead,
                      recordedKitDeaths:
                        deathsByCycle.get(cycleKey(doe.id, litterRow.actualKindlingDate)) ?? null,
                    }),
                  })
                : null;
              return {
              key: doe.id,
              sortValues: {
                doeTag: doe.tagId,
                breed: doe.breed,
                buckTag: litterRow.buck?.tagId,
                kindlingDate: litterRow.actualKindlingDate,
                dueDate,
                doeState: doe.doeState,
                alive: litterRow.litter?.bornAlive,
                dead,
                weanedCount: litterRow.litter?.weaned,
                weaningWeight: litterRow.litter?.weaningWeightGrams,
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
                  <TableCell>{dead || "—"}</TableCell>
                  {/* Enabled here, unlike the does board where the same two
                      inputs stay locked until "فطام" is pressed: this row
                      disappears from the list the moment she's weaned, so the
                      counts have to be typed in *before* the press. Doing it in
                      that order is also what puts the real numbers into the
                      permanent سجل الفطام row — markWeanedOp copies whatever the
                      litter holds at press time. */}
                  <TableCell>
                    <LitterCountInput
                      breedingId={litterRow.id}
                      field="weaned"
                      value={litterRow.litter?.weaned ?? null}
                      locale={locale}
                    />
                  </TableCell>
                  <TableCell>
                    <LitterWeightInput
                      breedingId={litterRow.id}
                      valueGrams={litterRow.litter?.weaningWeightGrams ?? null}
                      locale={locale}
                    />
                  </TableCell>
                  <TableCell>
                    <WeanButton
                      breedingId={litterRow.id}
                      doeId={doe.id}
                      text={t.weaning.weanButton}
                      active
                      weaned={false}
                      ready={weaningEntryComplete(litterRow.litter)}
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

      <WeaningLog weaningLog={weaningLog} locale={locale} t={t.weaning} todayOnly={todayOnly} />
    </div>
  );
}
