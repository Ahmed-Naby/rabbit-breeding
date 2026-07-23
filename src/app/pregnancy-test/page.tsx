import Link from "next/link";
import { Microscope } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { pregnancyTestDate, isToday } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, DoeActionButton, MatingFailedButton } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isPregnancyTestCandidate } from "@/lib/breeding-filters";
import { PregnancyTestLog } from "./pregnancy-test-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.pregnancyTest.title} · RabbitTrack` };
}

export default async function PregnancyTestPage({
  hideHeader,
  todayOnly,
}: {
  hideHeader?: boolean;
  todayOnly?: boolean;
} = {}) {
  // Same eligibility rule as "عشار"/"سالبة" on /does (canTestPregnancy): مُلقّحة
  // ولسه منتظرة نتيجة الجس. Extra filter here (not on /does): مدة انتظار الجس
  // المسجلة بالإعدادات لازم تكون عدّت من تاريخ التلقيح — أم اتلقحت من يومين
  // مثلًا لسه بدري عليها، فمش هتظهر هنا لحد ما الميعاد يجيله.
  const [candidates, settings, testLogRaw, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["bred", "nursing_bred"] },
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
    // Permanent, append-only log — written once by confirmPregnant/markMatingFailed
    // and never touched again, so both positive and negative results survive even
    // after the underlying Breeding row is reused for the doe's next mating.
    prisma.pregnancyTestLog.findMany({
      orderBy: { testDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        testDate: true,
        result: true,
        doe: { select: { id: true, tagId: true, breed: true } },
        buck: { select: { tagId: true } },
      },
    }),
    getDictionary(),
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const b = doe.breedingsAsDoe[0];
      if (!b || !isPregnancyTestCandidate({ ...b, actualKindlingDate: null }, settings.pregnancyTestDays, today)) return null;
      const testDate = pregnancyTestDate(new Date(b.matingDate!), settings.pregnancyTestDays);
      return { doe, b, testDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const testLog = todayOnly ? testLogRaw.filter((row) => isToday(row.testDate)) : testLogRaw;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader
          title={t.pregnancyTest.title}
          description={t.pregnancyTest.description(does.length, settings.pregnancyTestDays)}
        />
      )}

      {does.length === 0 ? (
        <EmptyState
          icon={Microscope}
          title={t.pregnancyTest.emptyTitle}
          description={t.pregnancyTest.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.pregnancyTest.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.pregnancyTest.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.pregnancyTest.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.pregnancyTest.colBuckTag, type: "tag", className: "text-center" },
              { key: "matingDate", label: t.pregnancyTest.colMatingDate, type: "date", className: "text-center" },
              { key: "testDate", label: t.pregnancyTest.colTestDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "doeState", label: t.pregnancyTest.colDoeState, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "action", label: t.pregnancyTest.colTestResult, className: "text-center", sortable: false },
            ]}
            rows={does.map(({ doe, b, testDate }, i) => ({
              key: doe.id,
              sortValues: {
                doeTag: doe.tagId,
                breed: doe.breed,
                buckTag: b.buck?.tagId,
                matingDate: b.matingDate,
                testDate,
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
                  <TableCell>{b.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={b.matingDate} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <LocalDate date={testDate} locale={locale} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <DoeActionButton
                        id={doe.id}
                        breedingId={b.id}
                        text={t.pregnancyTest.pregnantButton}
                        target={doe.doeState === "nursing_bred" ? "nursing_pregnant" : "pregnant"}
                        className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                        locale={locale}
                      />
                      <MatingFailedButton
                        breedingId={b.id}
                        doeId={doe.id}
                        text={t.pregnancyTest.negativeButton}
                        className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        locale={locale}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}

      <PregnancyTestLog testLog={testLog} locale={locale} t={t.pregnancyTest} todayOnly={todayOnly} />
    </div>
  );
}
