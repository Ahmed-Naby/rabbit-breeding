import { useEffect, useState, useCallback } from "react";
import { Box } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchNestBoxPageData } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, InstallNestBoxButton } from "../components/doe-state-menu";

export function NestBoxPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    does: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; expectedKindlingDate: string; buckTagId: string | null; breedingId: string }[];
    nestBoxDays: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchNestBoxPageData(db);
    setData({
      does: res.does,
      nestBoxDays: res.settings.nestBoxDays,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const { does, nestBoxDays } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{locale === "ar" ? "تركيب بيوت الولادة" : "Nest Box Installation"}</h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar"
            ? `أمهات بحاجة لتركيب بيت الولادة بعد مرور ${nestBoxDays} أيام من التلقيح (${does.length} أمهات)`
            : `Does requiring nest box installation after ${nestBoxDays} days (${does.length} does)`}
        </p>
      </div>

      {does.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Box className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{locale === "ar" ? "كل بيوت الولادة مركبة" : "All nest boxes installed"}</p>
          <p className="text-sm">
            {locale === "ar"
              ? "لا توجد أمهات تحتاج إلى تركيب بيت الولادة حاليًا."
              : "No does currently require nest box installation."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <th className="px-4 py-3">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "النوع" : "Breed"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "رقم الذكر" : "Buck ID"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "تاريخ الولادة المتوقع" : "Expected Kindling"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "حالة الأم" : "Doe State"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "التركيب" : "Install"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {does.map((row, index) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{row.tagId ?? "—"}</td>
                  <td className="px-4 py-3.5">{row.breed ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold">{row.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    {row.matingDate ? <LocalDate date={row.matingDate} /> : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={row.expectedKindlingDate} />
                  </td>
                  <td className="px-4 py-3.5">
                    <DoeStateBadge current={row.doeState} locale={locale} />
                  </td>
                  <td className="px-4 py-3.5">
                    <InstallNestBoxButton
                      breedingId={row.breedingId}
                      doeId={row.id}
                      locale={locale}
                      onDone={() => void load()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
