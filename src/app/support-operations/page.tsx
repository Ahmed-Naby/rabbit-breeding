import Link from "next/link";
import { Box, Skull } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import NestBoxPage from "../nest-box/page";
import MortalityPage from "../mortality/page";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.supportOperations.title} · RabbitTrack` };
}

export default async function SupportOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "nest-box";
  const { t } = await getDictionary();
  const sops = t.supportOperations;

  return (
    <div className="space-y-6">
      <PageHeader title={sops.title} description={sops.description} />

      {/* 2 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href="/support-operations?tab=nest-box"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "nest-box"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Box className="size-4 text-amber-500" />
          {sops.tabNestBox}
        </Link>

        <Link
          href="/support-operations?tab=mortality"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "mortality"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Skull className="size-4 text-rose-500" />
          {sops.tabMortality}
        </Link>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "nest-box" && <NestBoxPage hideHeader={true} todayOnly />}
        {activeTab === "mortality" && <MortalityPage hideHeader={true} todayOnly />}
      </div>
    </div>
  );
}
