import Link from "next/link";
import { addDays } from "date-fns";
import {
  HeartHandshake,
  Microscope,
  Droplets,
  HeartPulse,
  Milk,
  ArrowLeftRight,
  Skull,
  Layers,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { cn } from "@/lib/utils";
import { fromDateInputValue } from "@/lib/dates";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { MatingLog } from "../mating/mating-log";
import { PregnancyTestLog } from "../pregnancy-test/pregnancy-test-log";
import { ResorptionLog } from "./resorption-log";
import { KindlingLog } from "../kindling/kindling-log";
import { WeaningLog } from "../weaning/weaning-log";
import { FosteringLog } from "../fostering/fostering-log";
import { MortalityLog } from "../mortality/mortality-log";
import { CullingLog } from "../mortality/culling-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.records.title} · RabbitTrack` };
}

type DateRange = { from: Date | null; toExclusive: Date | null };

/** {gte, lt} for a DateTime field, or undefined when no bound is set (matches everything). */
function dateRangeWhere({ from, toExclusive }: DateRange) {
  if (!from && !toExclusive) return undefined;
  return { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) };
}

async function MatingLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const matingDateWhere = dateRangeWhere(range);
  const matingLog = await prisma.matingLog.findMany({
    where: matingDateWhere ? { matingDate: matingDateWhere } : undefined,
    orderBy: { matingDate: "desc" },
    select: {
      id: true,
      matingDate: true,
      wasNursingAtMating: true,
      doe: { select: { id: true, tagId: true, breed: true } },
      buck: { select: { tagId: true } },
    },
  });
  return <MatingLog matingLog={matingLog} locale={locale} t={t.mating} />;
}

async function PregnancyTestLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const testDateWhere = dateRangeWhere(range);
  const testLog = await prisma.pregnancyTestLog.findMany({
    where: testDateWhere ? { testDate: testDateWhere } : undefined,
    orderBy: { testDate: "desc" },
    select: {
      id: true,
      matingDate: true,
      testDate: true,
      result: true,
      doe: { select: { id: true, tagId: true, breed: true } },
      buck: { select: { tagId: true } },
    },
  });
  return <PregnancyTestLog testLog={testLog} locale={locale} t={t.pregnancyTest} />;
}

async function ResorptionLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const resorptionDateWhere = dateRangeWhere(range);
  const resorptionLog = await prisma.resorptionLog.findMany({
    where: resorptionDateWhere ? { resorptionDate: resorptionDateWhere } : undefined,
    orderBy: { resorptionDate: "desc" },
    select: {
      id: true,
      matingDate: true,
      resorptionDate: true,
      doe: { select: { id: true, tagId: true, breed: true } },
      buck: { select: { tagId: true } },
    },
  });
  return <ResorptionLog resorptionLog={resorptionLog} locale={locale} t={t.resorptionLog} />;
}

async function KindlingLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const kindlingDateWhere = dateRangeWhere(range);
  const [kindlingLog, litters, breedings] = await Promise.all([
    prisma.kindlingLog.findMany({
      where: kindlingDateWhere ? { kindlingDate: kindlingDateWhere } : undefined,
      orderBy: { kindlingDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        kindlingDate: true,
        doe: { select: { id: true, tagId: true, breed: true } },
        buck: { select: { tagId: true } },
      },
    }),
    prisma.litter.findMany({
      select: {
        kindlingDate: true,
        bornAlive: true,
        bornDead: true,
        breeding: { select: { doeId: true } },
      },
    }),
    prisma.breeding.findMany({
      where: { actualKindlingDate: { not: null } },
      select: { id: true, doeId: true, actualKindlingDate: true },
    }),
  ]);
  return (
    <KindlingLog kindlingLog={kindlingLog} litters={litters} breedings={breedings} locale={locale} t={t.kindling} />
  );
}

async function WeaningLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const weanedLitters = await prisma.litter.findMany({
    where: { weaningDate: { not: null, ...dateRangeWhere(range) } },
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
  });
  return <WeaningLog weanedLitters={weanedLitters} locale={locale} t={t.weaning} />;
}

async function FosteringLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const dateWhere = dateRangeWhere(range);
  const logs = await prisma.fosterLog.findMany({
    where: dateWhere ? { date: dateWhere } : undefined,
    include: {
      fromDoe: { select: { id: true, tagId: true } },
      toDoe: { select: { id: true, tagId: true } },
    },
    orderBy: { date: "desc" },
  });
  return <FosteringLog logs={logs} locale={locale} t={t} />;
}

async function MortalityLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const updatedAtWhere = dateRangeWhere(range);
  const [deceasedMothers, deceasedBucks, deceasedStock] = await Promise.all([
    // See mortality/page.tsx for why retiredTagId must be checked alongside
    // tagId — a deceased rabbit's tagId is cleared so the number can be reused.
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        status: "deceased",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
        ...(updatedAtWhere ? { updatedAt: updatedAtWhere } : {}),
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: {
        sex: "buck",
        status: "deceased",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
        ...(updatedAtWhere ? { updatedAt: updatedAtWhere } : {}),
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: {
        tagId: null,
        retiredTagId: null,
        status: "deceased",
        ...(updatedAtWhere ? { updatedAt: updatedAtWhere } : {}),
      },
      select: { id: true, sex: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return (
    <MortalityLog
      deceasedMothers={deceasedMothers}
      deceasedBucks={deceasedBucks}
      deceasedStock={deceasedStock}
      locale={locale}
      t={t}
    />
  );
}

async function CullingLogTab({ locale, t, range }: { locale: Locale; t: Dictionary; range: DateRange }) {
  const updatedAtWhere = dateRangeWhere(range);
  const culledRabbits = await prisma.rabbit.findMany({
    where: {
      status: "culled",
      OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      ...(updatedAtWhere ? { updatedAt: updatedAtWhere } : {}),
    },
    select: { id: true, tagId: true, retiredTagId: true, breed: true, sex: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return <CullingLog culledRabbits={culledRabbits} locale={locale} t={t} />;
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "mating";
  const { locale, t } = await getDictionary();
  const rt = t.records;

  const from = sp.from ? fromDateInputValue(sp.from) : null;
  const toSelected = sp.to ? fromDateInputValue(sp.to) : null;
  const toExclusive = toSelected ? addDays(toSelected, 1) : null;
  const range: DateRange = { from, toExclusive };
  const clearHref = `/records?tab=${activeTab}`;
  const dateQS = `${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader title={rt.title} description={rt.description} />

      <Card>
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={activeTab} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{rt.fromLabel}</span>
              <Input type="date" name="from" defaultValue={sp.from ?? ""} className="w-40" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{rt.toLabel}</span>
              <Input type="date" name="to" defaultValue={sp.to ?? ""} className="w-40" />
            </label>
            <Button type="submit" size="sm">
              {rt.applyButton}
            </Button>
            {(sp.from || sp.to) && (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={clearHref}>{rt.clearButton}</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href={`/records?tab=mating${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "mating"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <HeartHandshake className="size-4 text-pink-500" />
          {rt.tabMating}
        </Link>

        <Link
          href={`/records?tab=pregnancy-test${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "pregnancy-test"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Microscope className="size-4 text-purple-500" />
          {rt.tabPregnancyTest}
        </Link>

        <Link
          href={`/records?tab=resorption${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "resorption"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Droplets className="size-4 text-cyan-500" />
          {rt.tabResorption}
        </Link>

        <Link
          href={`/records?tab=kindling${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "kindling"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <HeartPulse className="size-4 text-emerald-500" />
          {rt.tabKindling}
        </Link>

        <Link
          href={`/records?tab=weaning${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "weaning"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Milk className="size-4 text-sky-500" />
          {rt.tabWeaning}
        </Link>

        <Link
          href={`/records?tab=fostering${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "fostering"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <ArrowLeftRight className="size-4 text-indigo-500" />
          {rt.tabFostering}
        </Link>

        <Link
          href={`/records?tab=mortality${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "mortality"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Skull className="size-4 text-rose-500" />
          {rt.tabMortality}
        </Link>

        <Link
          href={`/records?tab=culling${dateQS}`}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "culling"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Layers className="size-4 text-orange-500" />
          {rt.tabCulling}
        </Link>
      </div>

      <div className="animate-fade-in">
        {activeTab === "mating" && <MatingLogTab locale={locale} t={t} range={range} />}
        {activeTab === "pregnancy-test" && <PregnancyTestLogTab locale={locale} t={t} range={range} />}
        {activeTab === "resorption" && <ResorptionLogTab locale={locale} t={t} range={range} />}
        {activeTab === "kindling" && <KindlingLogTab locale={locale} t={t} range={range} />}
        {activeTab === "weaning" && <WeaningLogTab locale={locale} t={t} range={range} />}
        {activeTab === "fostering" && <FosteringLogTab locale={locale} t={t} range={range} />}
        {activeTab === "mortality" && <MortalityLogTab locale={locale} t={t} range={range} />}
        {activeTab === "culling" && <CullingLogTab locale={locale} t={t} range={range} />}
      </div>
    </div>
  );
}
