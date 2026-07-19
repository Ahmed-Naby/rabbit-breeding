"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { HealthRecordButton } from "@/components/health-record-form";
import { BUCK_DISEASE_TYPES } from "@/lib/health-conditions";
import { RabbitAvailabilityToggle } from "../does/doe-state-menu";
import { MarkDeceasedButton } from "../mortality/mortality-actions";
import { naturalCompare } from "@/lib/sortable";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";

type BuckRaw = {
  id: string;
  tagId: string | null;
  breed: string | null;
  status: string;
};

export function BucksRoundsList({
  bucks,
  locale,
}: {
  bucks: BuckRaw[];
  locale: Locale;
}) {
  const t = getClientDictionary(locale);
  const rt = t.bucksRounds;
  const [search, setSearch] = useState("");

  const sortedBucks = useMemo(
    () => [...bucks].sort((a, b) => naturalCompare(a.tagId ?? "", b.tagId ?? "")),
    [bucks]
  );

  const visibleBucks = useMemo(() => {
    const q = search.trim();
    if (!q) return sortedBucks;
    return sortedBucks.filter((b) => (b.tagId ?? "").includes(q));
  }, [sortedBucks, search]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={locale === "ar" ? "ابحث برقم الذكر…" : "Search by buck number…"}
          className="ps-9 w-full sm:max-w-xs"
        />
      </div>

      {visibleBucks.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا يوجد ذكر بهذا الرقم" : "No buck matches that number"}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleBucks.map((buck) => (
            <div key={buck.id} className="space-y-3 rounded-xl border bg-card p-3 shadow-xs hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <Link href={`/rabbits/${buck.id}`} className="text-base font-semibold hover:underline">
                    {buck.tagId ?? "—"}
                  </Link>
                  <span className="text-xs text-muted-foreground">{buck.breed ?? "—"}</span>
                </div>
                <StatusBadge value={buck.status} locale={locale} />
              </div>

              <RabbitAvailabilityToggle id={buck.id} current={buck.status} locale={locale} />

              <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                <span className="me-1 text-[11px] font-medium text-muted-foreground">{rt.healthLabel}</span>
                <HealthRecordButton
                  rabbitId={buck.id}
                  locale={locale}
                  diseaseTypes={BUCK_DISEASE_TYPES}
                  defaultDisease="mange"
                  t={rt}
                />
                <MarkDeceasedButton
                  id={buck.id}
                  confirmText={t.mortality.buckDeathConfirm(buck.tagId ?? "")}
                  locale={locale}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
