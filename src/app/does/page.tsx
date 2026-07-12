import Link from "next/link";
import { Rabbit as RabbitIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { LocalDate } from "@/components/local-date";
import { pregnancyTestDate, expectedKindling, rebreedDueDate, daysUntil } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import type { DoeState } from "@/lib/enums";
import {
  DoeStateBadge,
  DoeActionButton,
  MateCell,
  MatingFailedButton,
  MatingDateInput,
  KindleButton,
  WeanButton,
  LitterCountInput,
  ClearDoeButton,
} from "./doe-state-menu";

export const metadata = { title: "عمليات المزرعة · RabbitTrack" };

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
  const [doesRaw, settings] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { not: "deceased" } },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
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
  ]);

  const does = doesRaw;

  return (
    <div className="space-y-6">
      <PageHeader title="عمليات المزرعة" description="متابعة التلقيح واختبار الحمل لكل أم." />

      {does.length === 0 ? (
        <EmptyState
          icon={RabbitIcon}
          title="لا توجد أمهات في القطيع بعد"
          description="أضف رقم أي سلالة من صفحة إضافة أرنب (زر إضافة إلى القطيع) عشان تظهر هنا."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center" rowSpan={2}>م</TableHead>
                <TableHead className="text-center" rowSpan={2}>رقم الأم</TableHead>
                <TableHead className="text-center" rowSpan={2}>النوع</TableHead>
                <TableHead className="text-center" rowSpan={2}>حالة الأم</TableHead>
                <TableHead className="text-center" rowSpan={2}>تلقيح</TableHead>
                <TableHead className="text-center" rowSpan={2}>تاريخ التلقيح</TableHead>
                <TableHead className="text-center" rowSpan={2}>تاريخ الجس</TableHead>
                <TableHead className="text-center" rowSpan={2}>نتيجة الجس</TableHead>
                <TableHead className="text-center" rowSpan={2}>تاريخ الولادة</TableHead>
                <TableHead className="text-center" rowSpan={2}>ولادة</TableHead>
                <TableHead className="text-center" colSpan={2}>عدد المواليد</TableHead>
                <TableHead className="text-center" rowSpan={2}>فطام</TableHead>
                <TableHead className="text-center" rowSpan={2}>عدد الفطام</TableHead>
                <TableHead className="text-center" rowSpan={2}>تاريخ الفطام</TableHead>
                <TableHead className="text-center" rowSpan={2}>مسح</TableHead>
              </TableRow>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">حي</TableHead>
                <TableHead className="text-center">نافق</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map((doe, i) => {
                // `b` is undefined for a doe with no breeding row yet (just
                // reached mating weight, never bred before). She still
                // renders through this same row — every cell but "تلقيح"
                // naturally reads as blank/disabled since her doeState is
                // "empty" — instead of a separate simplified row.
                const [b, prev] = doe.breedingsAsDoe;
                // If she was rebred while nursing, the latest row is the
                // fresh rebreed attempt — her still-unweaned litter lives on
                // the previous row instead. Detected from the data itself
                // (kindled, not yet weaned, and the new row hasn't kindled
                // yet) rather than doeState, since doeState moves on to
                // "pregnant" once the new mating is confirmed while she may
                // still be nursing the old litter.
                const prevOngoingLitter =
                  !!prev?.actualKindlingDate &&
                  !prev?.litter?.weaningDate &&
                  !b?.actualKindlingDate;
                const litterRow = prevOngoingLitter ? prev : b;
                // Broader than prevOngoingLitter: keeps showing the previous
                // cycle's litter numbers (born counts, weaning date) right
                // after it's weaned too, as long as the new breeding row
                // hasn't produced its own litter yet — otherwise completing
                // "فطام" would immediately blank its own just-saved numbers.
                // Guarded by "b has never had a litter recorded" so reusing
                // an old row for a brand-new unrelated cycle doesn't pull in
                // ancient, unrelated litter history.
                const prevIsClosingLitter =
                  !!prev?.actualKindlingDate && !b?.actualKindlingDate && !b?.litter;
                const countsRow = prevIsClosingLitter ? prev : b;
                const isWeaned = !!countsRow?.litter?.weaningDate;
                // A nursing doe only re-enters "تلقيح" once the configured
                // rebreed system's cooldown since her kindling has elapsed
                // (0/15/30 days — مكثف/نصف مكثف/طبيعي, set in الإعدادات).
                // No kindling date on record means nothing to gate against.
                const rebreedReady =
                  !litterRow?.actualKindlingDate ||
                  daysUntil(
                    rebreedDueDate(
                      litterRow.actualKindlingDate,
                      settings.rebreedAfterKindlingDays
                    )
                  ) <= 0;
                const canMate =
                  doe.doeState === "empty" ||
                  doe.doeState === "excluded" ||
                  (doe.doeState === "nursing" && rebreedReady);
                const canTestPregnancy =
                  doe.doeState === "bred" || doe.doeState === "nursing_bred";
                const kindleActive =
                  doe.doeState === "pregnant" ||
                  doe.doeState === "nursing" ||
                  doe.doeState === "nursing_bred" ||
                  doe.doeState === "nursing_pregnant";
                const weanActive =
                  doe.doeState === "nursing" ||
                  doe.doeState === "nursing_bred" ||
                  doe.doeState === "nursing_pregnant" ||
                  prevOngoingLitter;
                const testDate = b?.matingDate
                  ? pregnancyTestDate(b.matingDate, settings.pregnancyTestDays)
                  : null;
                const kindlingDate =
                  litterRow?.actualKindlingDate ??
                  (b?.matingDate &&
                  (doe.doeState === "pregnant" ||
                    doe.doeState === "nursing" ||
                    doe.doeState === "nursing_pregnant")
                    ? expectedKindling(b.matingDate, 30)
                    : null);
                return (
                  <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                        {doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{doe.breed ?? "—"}</TableCell>
                    <TableCell>
                      <DoeStateBadge current={doe.doeState} />
                    </TableCell>
                    <TableCell>
                      <MateCell
                        breedingId={b?.id ?? null}
                        doeId={doe.id}
                        canMate={canMate}
                        buckTagId={b?.buck?.tagId ?? null}
                      />
                    </TableCell>
                    <TableCell>
                      {b ? (
                        <MatingDateInput breedingId={b.id} date={b.matingDate} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LocalDate date={testDate} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        <DoeActionButton
                          id={doe.id}
                          breedingId={b?.id ?? ""}
                          text="عشار"
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
                        />
                        {b ? (
                          <MatingFailedButton
                            breedingId={b.id}
                            doeId={doe.id}
                            text="سالبة"
                            disabled={!canTestPregnancy}
                            className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LocalDate date={kindlingDate} />
                    </TableCell>
                    <TableCell>
                      <KindleButton
                        breedingId={b?.id ?? ""}
                        doeId={doe.id}
                        text="ولادة"
                        doeState={doe.doeState as DoeState}
                      />
                    </TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="bornAlive"
                        value={countsRow?.litter?.bornAlive ?? null}
                        disabled={!kindleActive}
                      />
                    </TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="bornDead"
                        value={countsRow?.litter?.bornDead ?? null}
                        disabled={!kindleActive}
                      />
                    </TableCell>
                    <TableCell>
                      <WeanButton
                        breedingId={litterRow?.id ?? ""}
                        doeId={doe.id}
                        text="فطام"
                        active={weanActive}
                        weaned={isWeaned}
                      />
                    </TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="weaned"
                        value={countsRow?.litter?.weaned ?? null}
                        disabled={!isWeaned}
                      />
                    </TableCell>
                    <TableCell>
                      {countsRow?.litter?.weaningDate ? (
                        <LocalDate date={countsRow.litter.weaningDate} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {b ? (
                        <ClearDoeButton breedingId={b.id} doeId={doe.id} text="مسح" />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
