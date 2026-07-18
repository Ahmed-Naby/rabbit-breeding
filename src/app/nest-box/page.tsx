import Link from "next/link";
import { Box } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { nestBoxDueDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, InstallNestBoxButton } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isNestBoxCandidate } from "@/lib/breeding-filters";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.nestBox.title} · RabbitTrack` };
}

export default async function NestBoxPage() {
  // Any doe still mid-cycle (mated, kindling not yet recorded) is a nest-box
  // candidate once the configured offset from her mating date has passed —
  // "nursing" is excluded since that means this row's kindling already
  // happened, so the box's window for this cycle is over.
  const [candidates, settings, installedLog, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["bred", "pregnant", "nursing_bred", "nursing_pregnant"] },
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
            matingDate: true,
            nestBoxDate: true,
            buck: { select: { tagId: true } },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    // nestBoxDate isn't a permanent log (it lives on Breeding and gets reset
    // to null on cycle reuse, same as matingDate) — so "سجل تركيب بيوت
    // الولادة" reads straight off current Breeding rows, same reasoning as
    // "سجل التلقيح" on /mating.
    prisma.breeding.findMany({
      where: { nestBoxDate: { not: null } },
      orderBy: { nestBoxDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        nestBoxDate: true,
        doe: { select: { id: true, tagId: true, breed: true, doeState: true } },
        buck: { select: { tagId: true } },
      },
    }),
    getDictionary(),
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const b = doe.breedingsAsDoe[0];
      if (!b || !isNestBoxCandidate({ ...b, actualKindlingDate: null }, settings.nestBoxDays, today)) return null;
      const dueDate = nestBoxDueDate(new Date(b.matingDate!), settings.nestBoxDays);
      return { doe, b, dueDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nestBox.title}
        description={t.nestBox.description(does.length, settings.nestBoxDays)}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={Box}
          title={t.nestBox.emptyTitle}
          description={t.nestBox.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.nestBox.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.nestBox.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.nestBox.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.nestBox.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "matingDate", label: t.nestBox.colMatingDate, type: "date", className: "text-center" },
              { key: "dueDate", label: t.nestBox.colExpectedInstallDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "doeState", label: t.nestBox.colDoeState, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "install", label: t.nestBox.colInstall, className: "text-center", sortable: false },
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
                    <InstallNestBoxButton breedingId={b.id} doeId={doe.id} locale={locale} />
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.nestBox.logHeading}</h2>
        {installedLog.length === 0 ? (
          <EmptyState
            icon={Box}
            title={t.nestBox.logEmptyTitle}
            description={t.nestBox.logEmptyDescription}
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.nestBox.colIndex, className: "text-center", sortable: false },
                { key: "doeTag", label: t.nestBox.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: t.nestBox.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
                { key: "buckTag", label: t.nestBox.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
                { key: "matingDate", label: t.nestBox.colMatingDate, type: "date", className: "text-center" },
                { key: "installDate", label: t.nestBox.colInstallDate, type: "date", className: "text-center" },
                { key: "doeState", label: t.nestBox.colDoeState, type: "string", className: "hidden text-center sm:table-cell" },
              ]}
              rows={installedLog.map((row, i) => ({
                key: row.id,
                sortValues: {
                  doeTag: row.doe.tagId,
                  breed: row.doe.breed,
                  buckTag: row.buck?.tagId,
                  matingDate: row.matingDate,
                  installDate: row.nestBoxDate,
                  doeState: row.doe.doeState,
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
                    <TableCell>
                      <LocalDate date={row.matingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={row.nestBoxDate} locale={locale} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <DoeStateBadge current={row.doe.doeState} locale={locale} />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
