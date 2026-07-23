import Link from "next/link";
import { Sprout, Venus, Mars } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import StockPage from "../stock/page";
import MothersPage from "../mothers/page";
import BucksPage from "../bucks/page";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.herdAndStock.title} · RabbitTrack` };
}

export default async function HerdAndStockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "stock";
  const { t } = await getDictionary();
  const hs = t.herdAndStock;

  return (
    <div className="space-y-6">
      <PageHeader title={hs.title} description={hs.description} />

      {/* 3 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href="/herd-and-stock?tab=mothers"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "mothers"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Venus className="size-4 text-rose-500" />
          {hs.tabMothers}
        </Link>

        <Link
          href="/herd-and-stock?tab=bucks"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "bucks"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Mars className="size-4 text-sky-500" />
          {hs.tabBucks}
        </Link>

        <Link
          href="/herd-and-stock?tab=stock"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "stock"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Sprout className="size-4 text-emerald-500" />
          {hs.tabStock}
        </Link>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "stock" && <StockPage hideHeader={true} />}
        {activeTab === "mothers" && <MothersPage hideHeader={true} />}
        {activeTab === "bucks" && <BucksPage hideHeader={true} />}
      </div>
    </div>
  );
}
