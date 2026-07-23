import Link from "next/link";
import {
  HeartHandshake,
  Microscope,
  HeartPulse,
  Milk,
  ArrowLeftRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import MatingPage from "../mating/page";
import PregnancyTestPage from "../pregnancy-test/page";
import KindlingPage from "../kindling/page";
import WeaningPage from "../weaning/page";
import FosteringPage from "../fostering/page";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.dailyOperations.title} · RabbitTrack` };
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "mating";
  const { t } = await getDictionary();
  const ops = t.dailyOperations;

  return (
    <div className="space-y-6">
      <PageHeader title={ops.title} description={ops.description} />

      {/* 5 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href="/operations?tab=mating"
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "mating"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <HeartHandshake className="size-4 text-pink-500" />
          {ops.tabMating}
        </Link>

        <Link
          href="/operations?tab=pregnancy-test"
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "pregnancy-test"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Microscope className="size-4 text-purple-500" />
          {ops.tabPregnancyTest}
        </Link>

        <Link
          href="/operations?tab=kindling"
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "kindling"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <HeartPulse className="size-4 text-emerald-500" />
          {ops.tabKindling}
        </Link>

        <Link
          href="/operations?tab=weaning"
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "weaning"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Milk className="size-4 text-sky-500" />
          {ops.tabWeaning}
        </Link>

        <Link
          href="/operations?tab=fostering"
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "fostering"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <ArrowLeftRight className="size-4 text-indigo-500" />
          {ops.tabFostering}
        </Link>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "mating" && <MatingPage hideHeader={true} todayOnly />}
        {activeTab === "pregnancy-test" && <PregnancyTestPage hideHeader={true} todayOnly />}
        {activeTab === "kindling" && <KindlingPage hideHeader={true} todayOnly />}
        {activeTab === "weaning" && <WeaningPage hideHeader={true} todayOnly />}
        {activeTab === "fostering" && <FosteringPage hideHeader={true} todayOnly />}
      </div>
    </div>
  );
}
