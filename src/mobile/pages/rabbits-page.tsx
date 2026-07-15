import { useEffect, useState } from "react";
import { Users, Venus, Mars } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchRabbitsRoster, type LocalRabbit } from "../db/queries";
import { cn } from "@/lib/utils";
import { LABELS } from "@/lib/enums";

export function RabbitsPage({ locale, initialSex = "all" }: { locale: Locale; initialSex?: "doe" | "buck" | "all" }) {
  const t = getClientDictionary(locale);
  const [rabbits, setRabbits] = useState<LocalRabbit[] | null>(null);
  const [sex, setSex] = useState<"doe" | "buck" | "all">(initialSex);

  useEffect(() => {
    async function load() {
      setRabbits(null);
      const db = await getDb();
      const list = await fetchRabbitsRoster(db, sex);
      setRabbits(list);
    }
    void load();
  }, [sex]);

  if (!rabbits) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const titleMap = {
    all: locale === "ar" ? "سجل الأرانب العام" : "Herd Roster",
    doe: locale === "ar" ? "الأمهات (الإناث)" : "Mothers (Does)",
    buck: locale === "ar" ? "الذكور" : "Bucks",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{titleMap[sex]}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? `عرض وتصفية الأرانب النشطة بالمزرعة (${rabbits.length} أرنب)`
              : `View and filter active rabbits in the herd (${rabbits.length} rabbits)`}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-muted p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSex("all")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              sex === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {locale === "ar" ? "الكل" : "All"}
          </button>
          <button
            type="button"
            onClick={() => setSex("doe")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              sex === "doe" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {locale === "ar" ? "الإناث" : "Does"}
          </button>
          <button
            type="button"
            onClick={() => setSex("buck")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              sex === "buck" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {locale === "ar" ? "الذكور" : "Bucks"}
          </button>
        </div>
      </div>

      {rabbits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{locale === "ar" ? "لا توجد أرانب مسجلة" : "No rabbits registered"}</p>
          <p className="text-sm">
            {locale === "ar"
              ? "لم يتم العثور على أرانب تطابق خيار التصفية الحالي."
              : "No rabbits found matching the current filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">{locale === "ar" ? "رقم الأرنب" : "Tag ID"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "النوع" : "Breed"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "اللون" : "Color"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "الجنس" : "Sex"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "الحالة التناسلية" : "Reproductive State"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "العين/القفص" : "Cage"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rabbits.map((r) => {
                const sexLabel = LABELS[locale][r.sex] ?? r.sex;
                const statusLabel = LABELS[locale][r.status] ?? r.status;
                const doeStateLabel = LABELS[locale][r.doeState] ?? r.doeState;

                return (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3.5 font-medium">{r.tagId ?? "—"}</td>
                    <td className="px-4 py-3.5">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3.5">{r.color ?? "—"}</td>
                    <td className="px-4 py-3.5">{sexLabel}</td>
                    <td className="px-4 py-3.5">
                      {r.sex === "doe" ? (
                        <span className="inline-flex items-center rounded-full bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-950/20 dark:text-pink-300">
                          {doeStateLabel}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3.5">{r.cage ?? "—"}</td>
                    <td className="px-4 py-3.5">{statusLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
