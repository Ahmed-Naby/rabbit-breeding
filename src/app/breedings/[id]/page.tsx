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
import { getDictionary } from "@/lib/i18n/get-dictionary";

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
  const [breeding, { locale, t }] = await Promise.all([
    prisma.breeding.findUnique({
      where: { id },
      include: {
        buck: { select: { id: true, tagId: true } },
        doe: { select: { id: true, tagId: true } },
        litter: true,
      },
    }),
    getDictionary(),
  ]);
  if (!breeding) notFound();

  const recordKindlingWithId = recordKindling.bind(null, id);
  const daysLeft = daysUntil(breeding.expectedKindlingDate);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/rabbits/${breeding.doeId}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t.breedings.detailBackToDoe}
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {rabbitLink(breeding.buck)}
            <Heart className="size-5 text-muted-foreground" />
            {rabbitLink(breeding.doe)}
          </h1>
          <StatusBadge value={breeding.outcome} locale={locale} />
        </div>
        <div className="flex items-center gap-2">
          <OutcomeMenu id={breeding.id} current={breeding.outcome} locale={locale} />
          <Button size="sm" asChild>
            <Link href={`/breedings/${breeding.id}/edit`}>
              <Pencil className="size-4" /> {t.breedings.editButton}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DescItem label={t.breedings.colMatingDate}>
              <LocalDate date={breeding.matingDate} locale={locale} />
            </DescItem>
            <DescItem label={t.breedings.colExpectedKindling}>
              <LocalDate date={breeding.expectedKindlingDate} locale={locale} />
              {breeding.outcome === "pending" ? (
                <span className="ms-1 text-muted-foreground">
                  ({daysLeft >= 0 ? t.breedings.inDays(daysLeft) : t.breedings.overdueDays(Math.abs(daysLeft))})
                </span>
              ) : null}
            </DescItem>
            <DescItem label={t.breedings.colActualKindling}>
              {breeding.actualKindlingDate ? (
                <LocalDate date={breeding.actualKindlingDate} locale={locale} />
              ) : (
                "—"
              )}
            </DescItem>
            <DescItem label={t.breedings.colLitter}>
              {breeding.litter ? (
                <Link
                  href={`/litters/${breeding.litter.id}`}
                  className="text-primary hover:underline"
                >
                  {t.breedings.viewLitter}
                </Link>
              ) : (
                t.breedings.notRecorded
              )}
            </DescItem>
          </dl>
          {breeding.notes ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">{t.breedings.notesHeading}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{breeding.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {breeding.litter ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4" /> {t.breedings.litterCardTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DescItem label={t.litters.colKindlingDate}>
                <LocalDate date={breeding.litter.kindlingDate} locale={locale} />
              </DescItem>
              <DescItem label={t.breedings.colBornAlive}>{breeding.litter.bornAlive}</DescItem>
              <DescItem label={t.breedings.colBornDead}>{breeding.litter.bornDead}</DescItem>
              <DescItem label={t.breedings.colWeaned}>{breeding.litter.weaned ?? "—"}</DescItem>
            </dl>
            <Button variant="outline" size="sm" asChild className="mt-4">
              <Link href={`/litters/${breeding.litter.id}`}>{t.breedings.openLitterButton}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4" /> {t.breedings.recordKindlingCardTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KindlingForm
              action={recordKindlingWithId}
              defaultKindlingDate={breeding.expectedKindlingDate}
              locale={locale}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
