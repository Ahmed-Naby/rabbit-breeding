import { useEffect, useState, useCallback } from "react";
import { HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchFosteringPageData, type LocalFosterLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FosteringPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [logs, setLogs] = useState<LocalFosterLogEntry[] | null>(null);
  const [fromTagId, setFromTagId] = useState("");
  const [toTagId, setToTagId] = useState("");
  const [count, setCount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchFosteringPageData(db);
    setLogs(res.logs);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const source = fromTagId.trim();
    const dest = toTagId.trim();
    const qty = parseInt(count.trim(), 10);

    if (!source) {
      toast.error(locale === "ar" ? "يرجى إدخال رقم الأم المانحة" : "Please enter source doe ID");
      return;
    }
    if (!dest) {
      toast.error(locale === "ar" ? "يرجى إدخال رقم الأم المستلمة" : "Please enter target doe ID");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      toast.error(locale === "ar" ? "يرجى إدخال عدد خلفات صحيح" : "Please enter a valid count of kits");
      return;
    }

    setSubmitting(true);
    try {
      const { outcome } = await enqueue("transferKits", { fromTagId: source, toTagId: dest, count: qty });
      if (outcome.status === "rejected") {
        toast.error(outcome.resultMessage || t.doeStateMenu.invalidValueFallback);
      } else {
        toast.success(locale === "ar" ? "تم تسجيل عملية التبني بنجاح" : "Adoption recorded successfully");
        setFromTagId("");
        setToTagId("");
        setCount("");
        void load();
      }
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!logs) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.fostering.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.fostering.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === "ar" ? "تسجيل عملية تبني" : "Record an Adoption"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-1 space-y-2 w-full">
              <Label htmlFor="fromTagId">{locale === "ar" ? "من الأم (المانحة)" : "From Mother (Source)"}</Label>
              <Input
                id="fromTagId"
                placeholder="2A"
                value={fromTagId}
                onChange={(e) => setFromTagId(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex-1 space-y-2 w-full">
              <Label htmlFor="toTagId">{locale === "ar" ? "إلى الأم (المستقبلة)" : "To Mother (Recipient)"}</Label>
              <Input
                id="toTagId"
                placeholder="32"
                value={toTagId}
                onChange={(e) => setToTagId(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex-1 space-y-2 w-full">
              <Label htmlFor="count">{locale === "ar" ? "عدد الخلفات" : "Kit Count"}</Label>
              <Input
                id="count"
                type="number"
                min={1}
                placeholder="3"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={submitting}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {locale === "ar" ? "تسجيل التبني" : "Record Foster"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.fostering.logTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6">
              <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
                <HeartHandshake className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">{t.fostering.emptyTitle}</p>
                <p className="text-sm">{t.fostering.emptyDescription}</p>
              </div>
            </div>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{log.fromDoeTag ?? t.dashboard.stockFallback}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-bold">{log.toDoeTag ?? t.dashboard.stockFallback}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium tabular-nums">
                      {t.fostering.kitsUnit(log.count)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <LocalDate date={new Date(log.date)} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
