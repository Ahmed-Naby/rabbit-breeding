import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { expectedKindling } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import type { DoeState } from "@/lib/enums";
import { DoeStateBadge, KindleButton, LitterCountInput } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isKindlingCandidate } from "@/lib/breeding-filters";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.kindling.title} · RabbitTrack` };
}

/** yyyy-MM-dd key for matching by calendar day, TZ-agnostic since dates are stored at UTC midnight. */
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function KindlingPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  // "pregnant" / "nursing_pregnant" = confirmed pregnant, kindling not yet
  // recorded for this cycle (matches KindleButton's own `active` condition).
  const [candidates, settings, kindlingLog, litters, breedings, { locale, t }] = await Promise.all([
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

  // doeId + day -> litter counts, for enriching the kindling log below.
  const litterByDoeDay = new Map<
    string,
    { bornAlive: number; bornDead: number }
  >();
  for (const l of litters) {
    litterByDoeDay.set(`${l.breeding.doeId}_${dayKey(l.kindlingDate)}`, {
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
    });
  }

  // doeId + day -> breedingId, so "أحياء"/"نافق" can be edited inline.
  const breedingByDoeDay = new Map<string, string>();
  for (const b of breedings) {
    breedingByDoeDay.set(`${b.doeId}_${dayKey(b.actualKindlingDate!)}`, b.id);
  }

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

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.kindling.logHeading}</h2>
        {kindlingLog.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title={t.kindling.logEmptyTitle}
            description={t.kindling.logEmptyDescription}
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
                { key: "matingDate", label: t.kindling.colMatingDate, type: "date", className: "hidden text-center sm:table-cell" },
                { key: "kindlingDate", label: t.kindling.colKindlingDate, type: "date", className: "text-center" },
                { key: "bornAlive", label: t.kindling.colBornAlive, type: "number", className: "text-center" },
                { key: "bornDead", label: t.kindling.colBornDead, type: "number", className: "text-center" },
              ]}
              rows={kindlingLog.map((row, i) => {
                const day = dayKey(row.kindlingDate);
                const m = litterByDoeDay.get(`${row.doe.id}_${day}`);
                const breedingId = breedingByDoeDay.get(`${row.doe.id}_${day}`);
                return {
                  key: row.id,
                  sortValues: {
                    doeTag: row.doe.tagId,
                    breed: row.doe.breed,
                    buckTag: row.buck?.tagId,
                    matingDate: row.matingDate,
                    kindlingDate: row.kindlingDate,
                    bornAlive: m?.bornAlive,
                    bornDead: m?.bornDead,
                  },
                  node: (
                    <TableRow key={row.id} className="[&>td]:border-x [&>td]:text-center">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/rabbits/${row.doe.id}`} className="hover:underline">
                          {row.doe.tagId ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{row.doe.breed ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">{row.buck?.tagId ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <LocalDate date={row.matingDate} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <LocalDate date={row.kindlingDate} locale={locale} />
                      </TableCell>
                      <TableCell>
                        {breedingId ? (
                          <LitterCountInput
                            breedingId={breedingId}
                            field="bornAlive"
                            value={m?.bornAlive ?? null}
                            locale={locale}
                          />
                        ) : (
                          (m?.bornAlive ?? "—")
                        )}
                      </TableCell>
                      <TableCell>
                        {breedingId ? (
                          <LitterCountInput
                            breedingId={breedingId}
                            field="bornDead"
                            value={m?.bornDead ?? null}
                            locale={locale}
                          />
                        ) : (
                          (m?.bornDead ?? "—")
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
