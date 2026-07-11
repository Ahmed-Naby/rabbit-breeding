import Link from "next/link";
import { Microscope } from "lucide-react";
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
import { pregnancyTestDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { DoeStateBadge, DoeActionButton, MatingFailedButton } from "../does/doe-state-menu";

export const metadata = { title: "عمليات الجس · RabbitTrack" };

const RESULT_CLS: Record<string, string> = {
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const RESULT_LABEL: Record<string, string> = {
  positive: "موجب",
  negative: "سالب",
};

export default async function PregnancyTestPage() {
  // Same eligibility rule as "عشار"/"سالبة" on /does (canTestPregnancy): مُلقّحة
  // ولسه منتظرة نتيجة الجس. Extra filter here (not on /does): مدة انتظار الجس
  // المسجلة بالإعدادات لازم تكون عدّت من تاريخ التلقيح — أم اتلقحت من يومين
  // مثلًا لسه بدري عليها، فمش هتظهر هنا لحد ما الميعاد يجيله.
  const [candidates, settings, testLog] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { not: "deceased" },
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
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const b = doe.breedingsAsDoe[0];
      if (!b?.matingDate) return null;
      const testDate = pregnancyTestDate(b.matingDate, settings.pregnancyTestDays);
      if (testDate > today) return null;
      return { doe, b, testDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="عمليات الجس"
        description={`${does.length} أم حان موعد جسها (بعد ${settings.pregnancyTestDays} أيام من التلقيح).`}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={Microscope}
          title="لا توجد أمهات حان موعد جسها حاليًا"
          description="الأمهات اللي اتلقحت هتظهر هنا أول ما تعدي مدة انتظار الجس المسجلة بالإعدادات."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">م</TableHead>
                <TableHead className="text-center">رقم الأم</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">رقم الذكر</TableHead>
                <TableHead className="text-center">تاريخ التلقيح</TableHead>
                <TableHead className="text-center">تاريخ الجس</TableHead>
                <TableHead className="text-center">حالة الأم</TableHead>
                <TableHead className="text-center">نتيجة الجس</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map(({ doe, b, testDate }, i) => (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{doe.breed ?? "—"}</TableCell>
                  <TableCell>{b.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={b.matingDate} />
                  </TableCell>
                  <TableCell>
                    <LocalDate date={testDate} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <DoeActionButton
                        id={doe.id}
                        breedingId={b.id}
                        text="عشار"
                        target={doe.doeState === "nursing_bred" ? "nursing_pregnant" : "pregnant"}
                        className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                      />
                      <MatingFailedButton
                        breedingId={b.id}
                        doeId={doe.id}
                        text="سالبة"
                        className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">سجل الجس</h2>
        {testLog.length === 0 ? (
          <EmptyState
            icon={Microscope}
            title="لا يوجد جس مسجل بعد"
            description="أي أم يتم جسها (موجب أو سالب) هتظهر هنا مع تاريخ التلقيح والجس والنتيجة."
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الأم</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">رقم الذكر</TableHead>
                  <TableHead className="text-center">تاريخ التلقيح</TableHead>
                  <TableHead className="text-center">تاريخ الجس</TableHead>
                  <TableHead className="text-center">نتيجة الجس</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testLog.map((row, i) => (
                  <TableRow key={row.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${row.doe.id}`} className="hover:underline">
                        {row.doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{row.doe.breed ?? "—"}</TableCell>
                    <TableCell>{row.buck?.tagId ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={row.matingDate} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={row.testDate} />
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                          RESULT_CLS[row.result]
                        )}
                      >
                        {RESULT_LABEL[row.result] ?? row.result}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
