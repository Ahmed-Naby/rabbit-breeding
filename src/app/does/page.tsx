import Link from "next/link";
import { Rabbit as RabbitIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { getSettings } from "@/lib/settings";
import type { DoeState } from "@/lib/enums";
import { computeDoeBoardRow } from "@/lib/does-board";
import {
  DoeStateBadge,
  DoeActionButton,
  ConfirmPalpationButton,
  ResorptionButton,
  MateCell,
  MatingFailedButton,
  MatingDateInput,
  KindleButton,
  WeanButton,
  LitterCountInput,
  ClearDoeButton,
} from "./doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.does.title} · RabbitTrack` };
}

export default async function DoesPage() {
  // One row per doe (not per breeding): each doe shows only her latest
  // breeding cycle, so a mother with several mating attempts isn't repeated.
  // Shows every doe that's been promoted to the herd (has a tagId) — not
  // just ones already bred — so a freshly-promoted doe lands here right
  // away, rendered as a normal row (no cycle yet, so most cells are blank)
  // with just "تلقيح" active; pairings are random on this farm, so clicking
  // it auto-assigns a ready buck instead of asking which one. A tagId-less
  // "سلالة" never reaches this page at all — promotion (assigning a tagId
  // via /stock) is what makes her eligible.
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
          // Two, not one: for "مرضعة و ملقحة" (nursing_bred), the latest
          // breeding is the *new* rebreed row (no litter yet) — the ongoing
          // litter being nursed still lives on the previous row, and we need
          // both to render the row without losing sight of her current litter.
          take: 2,
          select: {
            id: true,
            matingDate: true,
            actualKindlingDate: true,
            palpationConfirmedDate: true,
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

  const does = doesRaw;

  return (
    <div className="space-y-6">
      <PageHeader title={t.does.title} description={t.does.description} />

      {does.length === 0 ? (
        <EmptyState
          icon={RabbitIcon}
          title={t.does.emptyTitle}
          description={t.does.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.does.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.does.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.does.colBreed, type: "string", className: "text-center" },
              { key: "doeState", label: t.does.colDoeState, type: "string", className: "text-center" },
              { key: "mate", label: t.does.colMate, type: "tag", className: "text-center" },
              { key: "matingDate", label: t.does.colMatingDate, type: "date", className: "text-center" },
              { key: "testDate", label: t.does.colTestDate, type: "date", className: "text-center" },
              { key: "testResult", label: t.does.colTestResult, className: "text-center", sortable: false },
              { key: "palpation", label: t.does.colPalpation, className: "text-center", sortable: false },
              { key: "kindlingDate", label: t.does.colKindlingDate, type: "date", className: "text-center" },
              { key: "kindle", label: t.does.colKindle, className: "text-center", sortable: false },
              { key: "bornAlive", label: t.does.colBornAlive, type: "number", className: "text-center" },
              { key: "bornDead", label: t.does.colBornDead, type: "number", className: "text-center" },
              { key: "wean", label: t.does.colWean, className: "text-center", sortable: false },
              { key: "weanedCount", label: t.does.colWeanedCount, type: "number", className: "text-center" },
              { key: "weaningDate", label: t.does.colWeaningDate, type: "date", className: "text-center" },
              { key: "clear", label: t.does.colClear, className: "text-center", sortable: false },
            ]}
            rows={does.map((doe, i) => {
                // `b` is undefined for a doe with no breeding row yet (just
                // reached mating weight, never bred before). She still
                // renders through this same row — every cell but "تلقيح"
                // naturally reads as blank/disabled since her doeState is
                // "empty" — instead of a separate simplified row.
                const {
                  current: b,
                  prevOngoingLitter,
                  litterRow,
                  countsRow,
                  isWeaned,
                  canMate,
                  canTestPregnancy,
                  canConfirmPalpation,
                  kindleActive,
                  weanActive,
                  testDate,
                  kindlingDate,
                } = computeDoeBoardRow(
                  doe.doeState as DoeState,
                  doe.status,
                  doe.breedingsAsDoe.map((x) => ({
                    id: x.id,
                    matingDate: x.matingDate,
                    actualKindlingDate: x.actualKindlingDate,
                    palpationConfirmedDate: x.palpationConfirmedDate,
                    buckTagId: x.buck?.tagId ?? null,
                    litter: x.litter,
                  })),
                  settings
                );
                return {
                  key: doe.id,
                  sortValues: {
                    doeTag: doe.tagId,
                    breed: doe.breed,
                    doeState: doe.doeState,
                    mate: b?.buckTagId ?? null,
                    matingDate: b?.matingDate,
                    testDate,
                    kindlingDate,
                    bornAlive: countsRow?.litter?.bornAlive,
                    bornDead: countsRow?.litter?.bornDead,
                    weanedCount: countsRow?.litter?.weaned,
                    weaningDate: countsRow?.litter?.weaningDate,
                  },
                  node: (
                  <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                        {doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{doe.breed ?? "—"}</TableCell>
                    <TableCell>
                      <DoeStateBadge current={doe.doeState} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <MateCell
                        breedingId={b?.id ?? null}
                        doeId={doe.id}
                        canMate={canMate}
                        buckTagId={b?.buckTagId ?? null}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      {b ? (
                        <MatingDateInput breedingId={b.id} date={b.matingDate} locale={locale} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LocalDate date={testDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        <DoeActionButton
                          id={doe.id}
                          breedingId={b?.id ?? ""}
                          text={t.does.pregnantButton}
                          target={
                            doe.doeState === "nursing_bred"
                              ? "nursing_pregnant"
                              : "pregnant"
                          }
                          disabled={!canTestPregnancy}
                          checked={
                            doe.doeState === "pregnant" ||
                            doe.doeState === "nursing_pregnant"
                          }
                          className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                          locale={locale}
                        />
                        {b ? (
                          <MatingFailedButton
                            breedingId={b.id}
                            doeId={doe.id}
                            text={t.does.negativeButton}
                            disabled={!canTestPregnancy}
                            className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                            locale={locale}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        <ConfirmPalpationButton
                          id={doe.id}
                          breedingId={b?.id ?? ""}
                          text={t.does.confirmPregnantButton}
                          disabled={!canConfirmPalpation}
                          checked={!!b?.palpationConfirmedDate}
                          locale={locale}
                        />
                        {b ? (
                          <ResorptionButton
                            id={doe.id}
                            breedingId={b.id}
                            text={t.does.resorptionButton}
                            disabled={!canConfirmPalpation}
                            locale={locale}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LocalDate date={kindlingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <KindleButton
                        breedingId={b?.id ?? ""}
                        doeId={doe.id}
                        text={t.does.kindleButton}
                        doeState={doe.doeState as DoeState}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="bornAlive"
                        value={countsRow?.litter?.bornAlive ?? null}
                        disabled={!kindleActive}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="bornDead"
                        value={countsRow?.litter?.bornDead ?? null}
                        disabled={!kindleActive}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <WeanButton
                        breedingId={litterRow?.id ?? ""}
                        doeId={doe.id}
                        text={t.does.weanButton}
                        active={weanActive}
                        weaned={isWeaned}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="weaned"
                        value={countsRow?.litter?.weaned ?? null}
                        disabled={!isWeaned}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      {countsRow?.litter?.weaningDate ? (
                        <LocalDate date={countsRow.litter.weaningDate} locale={locale} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {b ? (
                        <ClearDoeButton breedingId={b.id} doeId={doe.id} text={t.does.clearButton} locale={locale} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                  ),
                };
              })}
          />
        </div>
      )}
    </div>
  );
}
