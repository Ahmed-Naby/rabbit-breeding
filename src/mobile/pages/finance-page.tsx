import { useEffect, useState, useCallback } from "react";
import { Wallet, Plus, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchFinancePageData, type LocalTransaction } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { formatMoney } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toDateInputValue } from "@/lib/dates";

export function FinancePage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [transactions, setTransactions] = useState<LocalTransaction[]>([]);
  const [currency, setCurrency] = useState("USD");

  const [type, setType] = useState<"income" | "expense">("expense");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [category, setCategory] = useState("feed");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchFinancePageData(db);
    setTransactions(res.transactions);
    setCurrency(res.settings.currency);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount.trim());
    if (isNaN(val) || val <= 0) {
      toast.error(locale === "ar" ? "يرجى إدخال مبلغ صحيح" : "Please enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      const cents = Math.round(val * 100);
      await enqueue("createTransaction", {
        date,
        type,
        category,
        amountCents: cents,
        notes: notes.trim() || null,
      });

      toast.success(locale === "ar" ? "تم تسجيل المعاملة بنجاح" : "Transaction recorded successfully");
      setAmount("");
      setNotes("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(locale === "ar" ? "هل أنت متأكد من الحذف؟" : "Are you sure you want to delete this transaction?")) {
      return;
    }
    try {
      await enqueue("deleteTransaction", { id });
      toast.success(locale === "ar" ? "تم الحذف بنجاح" : "Deleted successfully");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const typeLabels = {
    income: locale === "ar" ? "إيراد" : "Income",
    expense: locale === "ar" ? "مصروف" : "Expense",
  };

  const categoryLabels: Record<string, string> = {
    sale: locale === "ar" ? "بيع إنتاج" : "Sales",
    purchase: locale === "ar" ? "شراء أرنب" : "Purchase Roster",
    feed: locale === "ar" ? "شراء علف" : "Feed",
    vet: locale === "ar" ? "رعاية بيطرية وعلاجات" : "Veterinary/Meds",
    equipment: locale === "ar" ? "معدات ومستلزمات" : "Equipment",
    other: locale === "ar" ? "مصاريف أخرى" : "Other",
  };

  const totalRevenue = transactions
    .filter((tr) => tr.type === "income")
    .reduce((sum, tr) => sum + tr.amountCents, 0);

  const totalExpense = transactions
    .filter((tr) => tr.type === "expense")
    .reduce((sum, tr) => sum + tr.amountCents, 0);

  const netBalance = totalRevenue - totalExpense;

  const toneCls = {
    income: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-50",
    expense: "border-red-200 bg-red-50 text-red-950 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-50",
    net: netBalance >= 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-50"
      : "border-red-200 bg-red-50 text-red-950 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-50",
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.finance}</h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar" ? "متابعة الحسابات والإيرادات والمصروفات المالية للمزرعة" : "Manage revenues and expenses"}
        </p>
      </div>

      {/* Financial Summaries Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={toneCls.income}>
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowUpRight className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{locale === "ar" ? "إجمالي الإيرادات" : "Total Revenue"}</p>
              <p className="text-xl font-bold">{formatMoney(totalRevenue, currency)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={toneCls.expense}>
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowDownLeft className="h-6 w-6 text-red-600 dark:text-red-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{locale === "ar" ? "إجمالي المصروفات" : "Total Expense"}</p>
              <p className="text-xl font-bold">{formatMoney(totalExpense, currency)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={toneCls.net}>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-6 w-6" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{locale === "ar" ? "صافي الرصيد" : "Net Balance"}</p>
              <p className="text-xl font-bold">{formatMoney(netBalance, currency)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{locale === "ar" ? "إضافة معاملة جديدة" : "Log New Transaction"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="type">{locale === "ar" ? "نوع المعاملة" : "Transaction Type"}</Label>
                <Select
                  items={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
                  value={type}
                  onValueChange={(v: any) => setType(v)}
                  disabled={submitting}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">{typeLabels.income}</SelectItem>
                    <SelectItem value="expense">{typeLabels.expense}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">{locale === "ar" ? "التاريخ" : "Date"}</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">{locale === "ar" ? "الفئة" : "Category"}</Label>
                <Select
                  items={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
                  value={category}
                  onValueChange={(v) => setCategory(v ?? "")}
                  disabled={submitting}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">{categoryLabels.sale}</SelectItem>
                    <SelectItem value="purchase">{categoryLabels.purchase}</SelectItem>
                    <SelectItem value="feed">{categoryLabels.feed}</SelectItem>
                    <SelectItem value="vet">{categoryLabels.vet}</SelectItem>
                    <SelectItem value="equipment">{categoryLabels.equipment}</SelectItem>
                    <SelectItem value="other">{categoryLabels.other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">{locale === "ar" ? `المبلغ (${currency})` : "Amount"}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{locale === "ar" ? "ملاحظات" : "Notes"}</Label>
                <Input id="notes" placeholder="..." value={notes} onChange={(e) => setNotes(e.target.value)} disabled={submitting} />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {locale === "ar" ? "تسجيل المعاملة" : "Save Transaction"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Transactions Ledger Log */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{locale === "ar" ? "سجل الحسابات" : "Financial Ledger Log"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {locale === "ar" ? "لا توجد معاملات مسجلة" : "No ledger entries found"}
              </p>
            ) : (
              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-sm text-left rtl:text-right border-collapse">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr className="border-b">
                      <th className="px-4 py-3">{locale === "ar" ? "التاريخ" : "Date"}</th>
                      <th className="px-4 py-3">{locale === "ar" ? "النوع" : "Type"}</th>
                      <th className="px-4 py-3">{locale === "ar" ? "الفئة" : "Category"}</th>
                      <th className="px-4 py-3 text-center">{locale === "ar" ? "المبلغ" : "Amount"}</th>
                      <th className="px-4 py-3">{locale === "ar" ? "البيان" : "Description / Notes"}</th>
                      <th className="px-4 py-3 w-12 text-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transactions.map((tr) => (
                      <tr key={tr.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3.5">
                          <LocalDate date={new Date(tr.date)} />
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={
                              tr.type === "income"
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-red-600 dark:text-red-400 font-medium"
                            }
                          >
                            {typeLabels[tr.type as keyof typeof typeLabels]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">{categoryLabels[tr.category] ?? tr.category}</td>
                        <td className="px-4 py-3.5 text-center font-bold tabular-nums">
                          {tr.type === "income" ? `+` : `-`}
                          {formatMoney(tr.amountCents, currency)}
                        </td>
                        <td className="px-4 py-3.5 max-w-[200px] truncate">{tr.notes ?? "—"}</td>
                        <td className="px-4 py-3.5 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(tr.id)}
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
  );
}
