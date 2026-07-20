import Link from "next/link";
import { Milk } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { weaningDueDate, survivalRate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, WeanButton, LitterCountInput, LitterWeightInput } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveNursingLitterRow, isWeaningCandidate } from "@/lib/breeding-filters";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.weaning.title} · RabbitTrack` };
}

export default async function WeaningPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  // Only doeStates that can carry an unweaned litter (see does/page.tsx's
  // weanActive logic). "مرضعة و ملقحة/عشار" rebred while still nursing, so
  // her latest breeding row is the new cycle (no litter yet) — the ongoing,
  // not-yet-weaned litter still lives on the *previous* row, hence take: 2.
  const [candidates, settings, weanedLitters, { locale, t }] = await Promise.all([
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
    // "سجل الفطام": litters already weaned, so "عدد الفطام" can be entered
    // inline here instead of having to go back to the does board.
    prisma.litter.findMany({
      where: { weaningDate: { not: null } },
      orderBy: { weaningDate: "desc" },
      select: {
        breedingId: true,
        kindlingDate: true,
        weaningDate: true,
        bornAlive: true,
        bornDead: true,
        weaned: true,
        weaningWeightGrams: true,
        breeding: {
          select: {
            doe: { select: { id: true, tagId: true, breed: true } },
            buck: { select: { tagId: true } },
          },
        },
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

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.weaning.logHeading}</h2>
        {weanedLitters.length === 0 ? (
          <EmptyState
            icon={Milk}
            title={t.weaning.logEmptyTitle}
            description={t.weaning.logEmptyDescription}
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
                { key: "kindlingDate", label: t.weaning.colKindlingDate, type: "date", className: "hidden text-center sm:table-cell" },
                { key: "weaningDate", label: t.weaning.colWeaningDate, type: "date", className: "text-center" },
                { key: "alive", label: t.weaning.colAlive, type: "number", className: "text-center" },
                { key: "dead", label: t.weaning.colDead, type: "number", className: "text-center" },
                { key: "weanedCount", label: t.weaning.colWeanedCount, type: "number", className: "text-center" },
                { key: "weaningWeight", label: t.weaning.colWeaningWeight, type: "number", className: "text-center" },
                { key: "survivalRate", label: t.weaning.colSurvivalRate, type: "number", className: "hidden text-center sm:table-cell" },
              ]}
              rows={weanedLitters.map((l, i) => {
                const r = survivalRate(l.bornAlive, l.weaned);
                return {
                  key: l.breedingId,
                  sortValues: {
                    doeTag: l.breeding.doe.tagId,
                    breed: l.breeding.doe.breed,
                    buckTag: l.breeding.buck?.tagId,
                    kindlingDate: l.kindlingDate,
                    weaningDate: l.weaningDate,
                    alive: l.bornAlive,
                    dead: l.bornDead,
                    weanedCount: l.weaned,
                    weaningWeight: l.weaningWeightGrams,
                    survivalRate: r,
                  },
                  node: (
                    <TableRow key={l.breedingId} className="[&>td]:border-x [&>td]:text-center">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/rabbits/${l.breeding.doe.id}`} className="hover:underline">
                          {l.breeding.doe.tagId ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{l.breeding.doe.breed ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">{l.breeding.buck?.tagId ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <LocalDate date={l.kindlingDate} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <LocalDate date={l.weaningDate} locale={locale} />
                      </TableCell>
                      <TableCell>{l.bornAlive}</TableCell>
                      <TableCell>{l.bornDead || "—"}</TableCell>
                      <TableCell>
                        <LitterCountInput
                          breedingId={l.breedingId}
                          field="weaned"
                          value={l.weaned}
                          locale={locale}
                          className="w-12"
                        />
                      </TableCell>
                      <TableCell>
                        <LitterWeightInput
                          breedingId={l.breedingId}
                          valueGrams={l.weaningWeightGrams}
                          locale={locale}
                          className="w-16"
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {r != null ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {Math.round(r * 100)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ),
                };
              })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
