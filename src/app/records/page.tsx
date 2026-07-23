import Link from "next/link";
import {
  HeartHandshake,
  Microscope,
  HeartPulse,
  Milk,
  ArrowLeftRight,
  Skull,
  Layers,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { MatingLog } from "../mating/mating-log";
import { PregnancyTestLog } from "../pregnancy-test/pregnancy-test-log";
import { KindlingLog } from "../kindling/kindling-log";
import { WeaningLog } from "../weaning/weaning-log";
import { FosteringLog } from "../fostering/fostering-log";
import { MortalityLog } from "../mortality/mortality-log";
import { CullingLog } from "../mortality/culling-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.records.title} · RabbitTrack` };
}

async function MatingLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const matingLog = await prisma.breeding.findMany({
    where: { matingDate: { not: null } },
    orderBy: { matingDate: "desc" },
    select: {
      id: true,
      matingDate: true,
      doe: { select: { id: true, tagId: true, breed: true, doeState: true } },
      buck: { select: { tagId: true } },
    },
  });
  return <MatingLog matingLog={matingLog} locale={locale} t={t.mating} />;
}

async function PregnancyTestLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const testLog = await prisma.pregnancyTestLog.findMany({
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

async function KindlingLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const [kindlingLog, litters, breedings] = await Promise.all([
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

async function WeaningLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const weanedLitters = await prisma.litter.findMany({
    where: { weaningDate: { not: null } },
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

async function FosteringLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const logs = await prisma.fosterLog.findMany({
    include: {
      fromDoe: { select: { id: true, tagId: true } },
      toDoe: { select: { id: true, tagId: true } },
    },
    orderBy: { date: "desc" },
  });
  return <FosteringLog logs={logs} locale={locale} t={t} />;
}

async function MortalityLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const [deceasedMothers, deceasedBucks, deceasedStock] = await Promise.all([
    // See mortality/page.tsx for why retiredTagId must be checked alongside
    // tagId — a deceased rabbit's tagId is cleared so the number can be reused.
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        status: "deceased",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: {
        sex: "buck",
        status: "deceased",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: { tagId: null, retiredTagId: null, status: "deceased" },
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

async function CullingLogTab({ locale, t }: { locale: Locale; t: Dictionary }) {
  const culledRabbits = await prisma.rabbit.findMany({
    where: {
      status: "culled",
      OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
    },
    select: { id: true, tagId: true, retiredTagId: true, breed: true, sex: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return <CullingLog culledRabbits={culledRabbits} locale={locale} t={t} />;
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "mating";
  const { locale, t } = await getDictionary();
  const rt = t.records;

  return (
    <div className="space-y-6">
      <PageHeader title={rt.title} description={rt.description} />

      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href="/records?tab=mating"
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
          href="/records?tab=pregnancy-test"
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
          href="/records?tab=kindling"
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
          href="/records?tab=weaning"
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
          href="/records?tab=fostering"
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
          href="/records?tab=mortality"
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
          href="/records?tab=culling"
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
        {activeTab === "mating" && <MatingLogTab locale={locale} t={t} />}
        {activeTab === "pregnancy-test" && <PregnancyTestLogTab locale={locale} t={t} />}
        {activeTab === "kindling" && <KindlingLogTab locale={locale} t={t} />}
        {activeTab === "weaning" && <WeaningLogTab locale={locale} t={t} />}
        {activeTab === "fostering" && <FosteringLogTab locale={locale} t={t} />}
        {activeTab === "mortality" && <MortalityLogTab locale={locale} t={t} />}
        {activeTab === "culling" && <CullingLogTab locale={locale} t={t} />}
      </div>
    </div>
  );
}
