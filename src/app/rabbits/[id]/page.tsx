import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Rabbit as RabbitIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { StatusMenu } from "./status-menu";
import { BreedingHistoryPanel } from "./breeding-history";
import { BuckBreedingHistoryPanel } from "./buck-breeding-history";

export const metadata = { title: "Rabbit · RabbitTrack" };

export default async function RabbitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rabbit = await prisma.rabbit.findUnique({ where: { id } });
  if (!rabbit) notFound();

  const isDoe = rabbit.sex === "doe";
  const isBuck = rabbit.sex === "buck";

  const [doePregnancyTests, doeKindlings, doeLitters, doeOngoing] = isDoe
    ? await Promise.all([
        prisma.pregnancyTestLog.findMany({
          where: { doeId: id },
          select: {
            matingDate: true,
            testDate: true,
            result: true,
            buck: { select: { tagId: true } },
          },
        }),
        prisma.kindlingLog.findMany({
          where: { doeId: id },
          select: {
            matingDate: true,
            kindlingDate: true,
            buck: { select: { tagId: true } },
          },
        }),
        prisma.litter.findMany({
          where: { breeding: { doeId: id } },
          select: {
            kindlingDate: true,
            bornAlive: true,
            bornDead: true,
            weaningDate: true,
            weaned: true,
          },
        }),
        prisma.breeding.findMany({
          where: { doeId: id, matingDate: { not: null } },
          select: { matingDate: true, buck: { select: { tagId: true } } },
        }),
      ])
    : [[], [], [], []];

  const [buckPregnancyTests, buckKindlings, buckLitters, buckOngoing] = isBuck
    ? await Promise.all([
        prisma.pregnancyTestLog.findMany({
          where: { buckId: id },
          select: {
            matingDate: true,
            result: true,
            doe: { select: { id: true, tagId: true, breed: true } },
          },
        }),
        prisma.kindlingLog.findMany({
          where: { buckId: id },
          select: {
            matingDate: true,
            kindlingDate: true,
            doe: { select: { id: true, tagId: true, breed: true } },
          },
        }),
        prisma.litter.findMany({
          where: { breeding: { buckId: id } },
          select: {
            kindlingDate: true,
            bornAlive: true,
            bornDead: true,
            breeding: { select: { doeId: true } },
          },
        }),
        prisma.breeding.findMany({
          where: { buckId: id, matingDate: { not: null } },
          select: {
            matingDate: true,
            doe: { select: { id: true, tagId: true, breed: true } },
          },
        }),
      ])
    : [[], [], [], []];

  const back =
    rabbit.tagId == null
      ? { href: "/stock", label: "العودة إلى السلالات" }
      : rabbit.sex === "doe"
        ? { href: "/mothers", label: "العودة إلى الأمهات" }
        : rabbit.sex === "buck"
          ? { href: "/bucks", label: "العودة إلى الذكور" }
          : { href: "/stock", label: "العودة إلى السلالات" };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={back.href}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {back.label}
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {rabbit.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rabbit.photoUrl}
                alt={rabbit.tagId ?? "سلالة بدون رقم"}
                className="size-full object-cover"
              />
            ) : (
              <RabbitIcon className="size-9 text-muted-foreground/50" />
            )}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {rabbit.tagId ? `رقم ${rabbit.tagId}` : "سلالة بدون رقم"}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={rabbit.status} />
              <StatusBadge value={rabbit.sex} />
              {rabbit.origin ? <StatusBadge value={rabbit.origin} /> : null}
              {rabbit.breed ? (
                <span className="text-sm text-muted-foreground">
                  {rabbit.breed}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusMenu id={rabbit.id} current={rabbit.status} />
          <Button size="sm" asChild>
            <Link href={`/rabbits/${rabbit.id}/edit`}>
              <Pencil className="size-4" /> تعديل
            </Link>
          </Button>
        </div>
      </div>

      {isDoe ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">سجل التزاوج</h2>
          <BreedingHistoryPanel
            pregnancyTests={doePregnancyTests}
            kindlings={doeKindlings}
            litters={doeLitters}
            ongoing={doeOngoing}
          />
        </div>
      ) : null}

      {isBuck ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">سجل التزاوج</h2>
          <BuckBreedingHistoryPanel
            pregnancyTests={buckPregnancyTests}
            kindlings={buckKindlings}
            litters={buckLitters}
            ongoing={buckOngoing}
          />
        </div>
      ) : null}
    </div>
  );
}
