import Link from "next/link";
import { Venus, Mars } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import RoundsPage from "../rounds/page";
import BucksRoundsPage from "../bucks-rounds/page";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.dailyRounds.title} · RabbitTrack` };
}

export default async function DailyRoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "does-rounds";
  const { t } = await getDictionary();
  const dr = t.dailyRounds;

  return (
    <div className="space-y-6">
      <PageHeader title={dr.title} description={dr.description} />

      {/* 2 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href="/daily-rounds?tab=does-rounds"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "does-rounds"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Venus className="size-4 text-rose-500" />
          {dr.tabDoesRounds}
        </Link>

        <Link
          href="/daily-rounds?tab=bucks-rounds"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "bucks-rounds"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Mars className="size-4 text-sky-500" />
          {dr.tabBucksRounds}
        </Link>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "does-rounds" && <RoundsPage hideHeader={true} />}
        {activeTab === "bucks-rounds" && <BucksRoundsPage hideHeader={true} />}
      </div>
    </div>
  );
}
