import { useEffect, useState, useCallback } from "react";
import { Microscope, Plus, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchHealthPageData, type LocalHealthRecord } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LocalRabbit } from "../db/types";
import { toDateInputValue } from "@/lib/dates";

export function HealthPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [activeRabbits, setActiveRabbits] = useState<LocalRabbit[]>([]);
  const [records, setRecords] = useState<LocalHealthRecord[]>([]);

  const [rabbitId, setRabbitId] = useState("");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [type, setType] = useState<"vaccination" | "treatment" | "illness" | "deworming" | "checkup">("treatment");
  const [description, setDescription] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchHealthPageData(db);
    setActiveRabbits(res.activeRabbits);
    setRecords(res.records);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rabbitId) {
      toast.error(locale === "ar" ? "يرجى اختيار أرنب" : "Please select a rabbit");
      return;
    }
    if (!description.trim()) {
      toast.error(locale === "ar" ? "يرجى إدخال تفاصيل التشخيص/العلاج" : "Please enter description");
      return;
    }

    setSubmitting(true);
    try {
      await enqueue("createHealthRecord", {
        rabbitId,
        date,
        type,
        description: description.trim(),
        nextDueDate: nextDueDate || null,
      });

      toast.success(locale === "ar" ? "تم تسجيل الملف الصحي بنجاح" : "Health record logged successfully");
      setDescription("");
      setNextDueDate("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(locale === "ar" ? "هل أنت متأكد من الحذف؟" : "Are you sure you want to delete this record?")) {
      return;
    }
    try {
      await enqueue("deleteHealthRecord", { id });
      toast.success(locale === "ar" ? "تم الحذف بنجاح" : "Deleted successfully");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const typeLabels = {
    vaccination: locale === "ar" ? "تحصين" : "Vaccination",
    treatment: locale === "ar" ? "علاج" : "Treatment",
    illness: locale === "ar" ? "مرض" : "Illness",
    deworming: locale === "ar" ? "مضاد طفيليات" : "Deworming",
    checkup: locale === "ar" ? "فحص دوري" : "Checkup",
  };

  const upcomingReminders = records.filter(
    (r) => r.nextDueDate && new Date(r.nextDueDate).getTime() >= new Date().setUTCHours(0,0,0,0)
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.health}</h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar" ? "متابعة التطعيمات والتحصينات والعلاجات البيطرية للأرانب" : "Log vaccines, treatments, and checkups"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{locale === "ar" ? "تسجيل فحص أو علاج جديد" : "New Health Record"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rabbitId">{locale === "ar" ? "الأرنب" : "Rabbit"}</Label>
                <Select value={rabbitId} onValueChange={setRabbitId} disabled={submitting}>
                  <SelectTrigger id="rabbitId">
                    <SelectValue placeholder={locale === "ar" ? "اختر أرنب..." : "Select rabbit..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeRabbits.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.tagId ?? `${r.breed ?? "—"} (${r.cage ?? "—"})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">{locale === "ar" ? "التاريخ" : "Date"}</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">{locale === "ar" ? "نوع الإجراء" : "Procedure Type"}</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)} disabled={submitting}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vaccination">{typeLabels.vaccination}</SelectItem>
                    <SelectItem value="treatment">{typeLabels.treatment}</SelectItem>
                    <SelectItem value="illness">{typeLabels.illness}</SelectItem>
                    <SelectItem value="deworming">{typeLabels.deworming}</SelectItem>
                    <SelectItem value="checkup">{typeLabels.checkup}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{locale === "ar" ? "التشخيص/العلاج/الجرعة" : "Description / Dosage"}</Label>
                <Input
                  id="description"
                  placeholder={locale === "ar" ? "مثال: تطعيم معوي 1 سم" : "e.g. 1cc Ivermectin"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextDueDate">{locale === "ar" ? "تاريخ التذكير القادم (اختياري)" : "Next Reminder Date (optional)"}</Label>
                <Input
                  id="nextDueDate"
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {locale === "ar" ? "تسجيل الإجراء" : "Log Procedure"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Reminders & Ledger Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Reminders List */}
          <Card className="border-amber-100 bg-amber-50/20 dark:border-amber-950 dark:bg-amber-950/10">
            <CardHeader className="py-4">
              <CardTitle className="text-base text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {locale === "ar" ? "تذكيرات المواعيد القادمة" : "Upcoming Veterinary Reminders"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingReminders.length === 0 ? (
                <p className="px-6 py-4 text-sm text-muted-foreground">
                  {locale === "ar" ? "لا توجد تذكيرات صحية مجدولة" : "No health reminders scheduled"}
                </p>
              ) : (
                <div className="divide-y max-h-[220px] overflow-y-auto">
                  {upcomingReminders.map((r) => (
                    <div key={r.id} className="flex justify-between items-center px-6 py-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          {r.rabbitTag ?? "—"} · <span className="text-amber-800 dark:text-amber-300 font-medium">{typeLabels[r.type as keyof typeof typeLabels]}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      </div>
                      <span className="text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2.5 py-1 rounded-full">
                        <LocalDate date={new Date(r.nextDueDate!)} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Health Ledger log */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{locale === "ar" ? "سجل الملفات الصحية" : "Past Veterinary Treatments Log"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {records.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {locale === "ar" ? "لا توجد سجلات صحية مسجلة" : "No health records found"}
                </p>
              ) : (
                <div className="rounded-xl border bg-card overflow-x-auto">
                  <table className="w-full text-sm text-left rtl:text-right border-collapse">
                    <thead className="bg-muted text-muted-foreground text-xs uppercase">
                      <tr className="border-b">
                        <th className="px-4 py-3">{locale === "ar" ? "التاريخ" : "Date"}</th>
                        <th className="px-4 py-3">{locale === "ar" ? "الأرنب" : "Rabbit"}</th>
                        <th className="px-4 py-3">{locale === "ar" ? "النوع" : "Type"}</th>
                        <th className="px-4 py-3">{locale === "ar" ? "التشخيص/العلاج" : "Treatment details"}</th>
                        <th className="px-4 py-3 w-12 text-center" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {records.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/40">
                          <td className="px-4 py-3.5">
                            <LocalDate date={new Date(r.date)} />
                          </td>
                          <td className="px-4 py-3.5 font-bold">{r.rabbitTag ?? "—"}</td>
                          <td className="px-4 py-3.5 font-semibold">{typeLabels[r.type as keyof typeof typeLabels]}</td>
                          <td className="px-4 py-3.5">{r.description}</td>
                          <td className="px-4 py-3.5 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(r.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
