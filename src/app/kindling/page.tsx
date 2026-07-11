import Link from "next/link";
import { HeartPulse } from "lucide-react";
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
import { expectedKindling, survivalRate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import type { DoeState } from "@/lib/enums";
import { DoeStateBadge, KindleButton, LitterCountInput } from "../does/doe-state-menu";

export const metadata = { title: "عمليات الولادة · RabbitTrack" };

/** yyyy-MM-dd key for matching by calendar day, TZ-agnostic since dates are stored at UTC midnight. */
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function KindlingPage() {
  // "pregnant" / "nursing_pregnant" = confirmed pregnant, kindling not yet
  // recorded for this cycle (matches KindleButton's own `active` condition).
  const [candidates, settings, kindlingLog, litters, breedings] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { not: "deceased" },
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
        weaned: true,
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
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const b = doe.breedingsAsDoe[0];
      if (!b?.matingDate) return null;
      const dueDate = expectedKindling(b.matingDate, settings.gestationDays);
      if (dueDate > today) return null;
      return { doe, b, dueDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  // doeId + day -> litter counts, for enriching the kindling log below.
  const litterByDoeDay = new Map<
    string,
    { bornAlive: number; bornDead: number; weaned: number | null }
  >();
  for (const l of litters) {
    litterByDoeDay.set(`${l.breeding.doeId}_${dayKey(l.kindlingDate)}`, {
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
      weaned: l.weaned,
    });
  }

  // doeId + day -> breedingId, so "أحياء"/"نافق" can be edited inline.
  const breedingByDoeDay = new Map<string, string>();
  for (const b of breedings) {
    breedingByDoeDay.set(`${b.doeId}_${dayKey(b.actualKindlingDate!)}`, b.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="عمليات الولادة"
        description={`${does.length} أم حان موعد ولادتها (بعد ${settings.gestationDays} يومًا من التلقيح).`}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="لا توجد أمهات حان موعد ولادتها حاليًا"
          description="الأمهات العشار هتظهر هنا أول ما تعدي مدة الحمل المسجلة بالإعدادات."
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
                <TableHead className="text-center">تاريخ الولادة المتوقع</TableHead>
                <TableHead className="text-center">حالة الأم</TableHead>
                <TableHead className="text-center">ولادة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map(({ doe, b, dueDate }, i) => (
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
                    <LocalDate date={dueDate} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} />
                  </TableCell>
                  <TableCell>
                    <KindleButton
                      breedingId={b.id}
                      doeId={doe.id}
                      text="ولادة"
                      doeState={doe.doeState as DoeState}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">سجل الولادات</h2>
        {kindlingLog.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="لا توجد ولادات مسجلة بعد"
            description="أي أم يتم تسجيل ولادتها هتظهر هنا مع تاريخ التلقيح والولادة."
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
                  <TableHead className="text-center">تاريخ الولادة</TableHead>
                  <TableHead className="text-center">أحياء</TableHead>
                  <TableHead className="text-center">نافق</TableHead>
                  <TableHead className="text-center">مفطوم</TableHead>
                  <TableHead className="text-center">نسبة البقاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kindlingLog.map((row, i) => {
                  const day = dayKey(row.kindlingDate);
                  const m = litterByDoeDay.get(`${row.doe.id}_${day}`);
                  const r = m ? survivalRate(m.bornAlive, m.weaned) : null;
                  const breedingId = breedingByDoeDay.get(`${row.doe.id}_${day}`);
                  return (
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
                        <LocalDate date={row.kindlingDate} />
                      </TableCell>
                      <TableCell>
                        {breedingId ? (
                          <LitterCountInput
                            breedingId={breedingId}
                            field="bornAlive"
                            value={m?.bornAlive ?? null}
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
                          />
                        ) : (
                          (m?.bornDead ?? "—")
                        )}
                      </TableCell>
                      <TableCell>{m?.weaned ?? "—"}</TableCell>
                      <TableCell>
                        {r != null ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {Math.round(r * 100)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
