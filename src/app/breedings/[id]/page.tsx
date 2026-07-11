import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Heart, Baby } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { daysUntil } from "@/lib/dates";
import { recordKindling } from "../actions";
import { KindlingForm } from "./kindling-form";
import { OutcomeMenu } from "./outcome-menu";

export const metadata = { title: "Mating · RabbitTrack" };

function DescItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function rabbitLink(r: { id: string; tagId: string | null } | null) {
  if (!r) return <span className="text-muted-foreground">—</span>;
  return (
    <Link href={`/rabbits/${r.id}`} className="text-primary hover:underline">
      {r.tagId ?? "—"}
    </Link>
  );
}

export default async function BreedingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const breeding = await prisma.breeding.findUnique({
    where: { id },
    include: {
      buck: { select: { id: true, tagId: true } },
      doe: { select: { id: true, tagId: true } },
      litter: true,
    },
  });
  if (!breeding) notFound();

  const recordKindlingWithId = recordKindling.bind(null, id);
  const daysLeft = daysUntil(breeding.expectedKindlingDate);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/rabbits/${breeding.doeId}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> العودة إلى الأم
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {rabbitLink(breeding.buck)}
            <Heart className="size-5 text-muted-foreground" />
            {rabbitLink(breeding.doe)}
          </h1>
          <StatusBadge value={breeding.outcome} />
        </div>
        <div className="flex items-center gap-2">
          <OutcomeMenu id={breeding.id} current={breeding.outcome} />
          <Button size="sm" asChild>
            <Link href={`/breedings/${breeding.id}/edit`}>
              <Pencil className="size-4" /> تعديل
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DescItem label="تاريخ التلقيح">
              <LocalDate date={breeding.matingDate} />
            </DescItem>
            <DescItem label="موعد الولادة المتوقع">
              <LocalDate date={breeding.expectedKindlingDate} />
              {breeding.outcome === "pending" ? (
                <span className="ms-1 text-muted-foreground">
                  ({daysLeft >= 0 ? `خلال ${daysLeft} يوم` : `متأخرة ${Math.abs(daysLeft)} يوم`})
                </span>
              ) : null}
            </DescItem>
            <DescItem label="تاريخ الولادة الفعلي">
              {breeding.actualKindlingDate ? (
                <LocalDate date={breeding.actualKindlingDate} />
              ) : (
                "—"
              )}
            </DescItem>
            <DescItem label="الولادة">
              {breeding.litter ? (
                <Link
                  href={`/litters/${breeding.litter.id}`}
                  className="text-primary hover:underline"
                >
                  عرض الولادة
                </Link>
              ) : (
                "لم تُسجَّل"
              )}
            </DescItem>
          </dl>
          {breeding.notes ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">ملاحظات</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{breeding.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {breeding.litter ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4" /> الولادة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DescItem label="تاريخ الولادة">
                <LocalDate date={breeding.litter.kindlingDate} />
              </DescItem>
              <DescItem label="مواليد أحياء">{breeding.litter.bornAlive}</DescItem>
              <DescItem label="مواليد أموات">{breeding.litter.bornDead}</DescItem>
              <DescItem label="مفطوم">{breeding.litter.weaned ?? "—"}</DescItem>
            </dl>
            <Button variant="outline" size="sm" asChild className="mt-4">
              <Link href={`/litters/${breeding.litter.id}`}>فتح الولادة</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4" /> تسجيل الولادة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KindlingForm
              action={recordKindlingWithId}
              defaultKindlingDate={breeding.expectedKindlingDate}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
