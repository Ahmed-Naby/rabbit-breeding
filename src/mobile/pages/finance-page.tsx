import { useEffect, useState, useCallback } from "react";
import { Wallet, Plus, Trash2, ArrowUpRight, ArrowDownLeft, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchFinancePageData, type LocalTransaction } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { formatMoney } from "@/lib/units";
import { TRANSACTION_CATEGORIES, label } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toDateInputValue } from "@/lib/dates";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { PageHeader } from "@/components/page-header";
import {
  parseRecurringExpenses,
  dueRecurringPostings,
  recurringMonthlyTotalCents,
  type RecurringExpense,
} from "@/lib/recurring-expenses";
import { createId } from "@paralleldrive/cuid2";

export function FinancePage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [transactions, setTransactions] = useState<LocalTransaction[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [feedPricePerTonCents, setFeedPricePerTonCents] = useState(0);
  const [tons, setTons] = useState("");

  // المصروفات الثابتة الشهرية
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [postedRecurringIds, setPostedRecurringIds] = useState<string[]>([]);
  const [doeCount, setDoeCount] = useState(0);
  const [recCategory, setRecCategory] = useState("rent");
  const [recAmount, setRecAmount] = useState("");
  const [recDay, setRecDay] = useState("1");
  const [recStart, setRecStart] = useState(() => toDateInputValue(new Date()));
  const [recNote, setRecNote] = useState("");
  const [recBusy, setRecBusy] = useState(false);

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
    setFeedPricePerTonCents(res.settings.feedPricePerTonCents);
    setRecurring(parseRecurringExpenses(res.settings.recurringExpenses));
    setPostedRecurringIds(res.postedRecurringIds);
    setDoeCount(res.doeCount);
  }, []);

  const showTonnage = category === "feed" && feedPricePerTonCents > 0;

  const setTonnage = (value: string) => {
    setTons(value);
    const qty = Number(value);
    // A cleared or nonsense quantity leaves the amount alone rather than
    // zeroing it: the farm may well know the bill without knowing the tonnage.
    if (!value.trim() || !Number.isFinite(qty) || qty <= 0) return;
    setAmount(((qty * feedPricePerTonCents) / 100).toFixed(2));
  };

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
      setTons("");
      setNotes("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  // Same three helpers as the web card, over the same shared lib — the two
  // platforms must never disagree about which month is due.
  const recurringMonthly = recurringMonthlyTotalCents(recurring);
  const dueRecurring = dueRecurringPostings(recurring, new Date(), new Set(postedRecurringIds));
  const dueRecurringTotal = dueRecurring.reduce((s, r) => s + r.amountCents, 0);

  /** The templates are one Json value, so every edit rewrites the whole list. */
  const saveTemplates = async (next: RecurringExpense[]) => {
    await enqueue("updateRecurringExpenses", { recurringExpenses: next });
  };

  const handleAddRecurring = async () => {
    const val = parseFloat(recAmount.trim());
    if (isNaN(val) || val <= 0) {
      toast.error(locale === "ar" ? "يرجى إدخال مبلغ صحيح" : "Please enter a valid amount");
      return;
    }
    const day = Math.min(28, Math.max(1, Math.round(Number(recDay) || 1)));
    setRecBusy(true);
    try {
      await saveTemplates([
        ...recurring,
        {
          id: createId(),
          category: recCategory,
          amountCents: Math.round(val * 100),
          dayOfMonth: day,
          startDate: recStart,
          note: recNote.trim() || null,
        },
      ]);
      toast.success(t.finance.recurringAddedToast);
      setRecAmount("");
      setRecNote("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setRecBusy(false);
    }
  };

  const handleRemoveRecurring = async (id: string) => {
    if (!window.confirm(t.finance.recurringRemoveConfirm)) return;
    setRecBusy(true);
    try {
      await saveTemplates(recurring.filter((tpl) => tpl.id !== id));
      toast.success(t.finance.recurringRemovedToast);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setRecBusy(false);
    }
  };

  const handlePostRecurring = async () => {
    if (dueRecurring.length === 0) {
      toast.info(t.finance.recurringNothingDue);
      return;
    }
    setRecBusy(true);
    try {
      // One op carrying every posting, not one op each: the ids are already
      // derived from template + month, so the batch is idempotent as a whole
      // and a half-synced outbox can't leave a month partly booked.
      await enqueue("postRecurringExpenses", {
        postings: dueRecurring.map((r) => ({
          id: r.id,
          date: r.date.toISOString(),
          category: r.category,
          amountCents: r.amountCents,
          notes: r.notes,
        })),
      });
      toast.success(t.finance.recurringPostedToast(dueRecurring.length));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setRecBusy(false);
    }
  };

  const typeLabels = {
    income: locale === "ar" ? "إيراد" : "Income",
    expense: locale === "ar" ? "مصروف" : "Expense",
  };

  // Derived from the shared list rather than spelled out again: this page used
  // its own six hard-coded labels and its own six <SelectItem>s, so the three
  // categories added to enums.ts were reachable on the web and invisible here.
  const categoryLabels: Record<string, string> = Object.fromEntries(
    TRANSACTION_CATEGORIES.map((c) => [c, label(c, locale)])
  );

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

  const transactionsSort = useSortableRows(transactions, {
    date: { type: "date", value: (tr) => tr.date },
    type: { type: "string", value: (tr) => tr.type },
    category: { type: "string", value: (tr) => tr.category },
    amount: { type: "number", value: (tr) => tr.amountCents },
    notes: { type: "string", value: (tr) => tr.notes },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nav.finance}
        description={locale === "ar" ? "متابعة الحسابات والإيرادات والمصروفات المالية للمزرعة" : "Manage revenues and expenses"}
      />

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
                    {TRANSACTION_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryLabels[c]}
                      </SelectItem>
                    ))}
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

              {showTonnage ? (
                // Not stored with the transaction — only a calculator for the
                // amount, so changing the ton price later can't rewrite what an
                // old feed bill actually cost.
                <div className="space-y-2">
                  <Label htmlFor="feedTons">{t.finance.feedTonsLabel}</Label>
                  <Input
                    id="feedTons"
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={tons}
                    onChange={(e) => setTonnage(e.target.value)}
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.finance.feedTonsHint(formatMoney(feedPricePerTonCents, currency))}
                  </p>
                </div>
              ) : null}

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

        {/* المصروفات الثابتة الشهرية */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {t.finance.recurringTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">{t.finance.recurringDescription}</p>

            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.finance.recurringEmpty}</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {recurring.map((tpl) => (
                  <div key={tpl.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {categoryLabels[tpl.category] ?? tpl.category}
                        {tpl.note ? (
                          <span className="ms-2 font-normal text-muted-foreground">{tpl.note}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.finance.recurringDayOf(tpl.dayOfMonth)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                        −{formatMoney(tpl.amountCents, currency)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={recBusy}
                        onClick={() => handleRemoveRecurring(tpl.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {recurring.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {t.finance.recurringMonthlyTotal(formatMoney(recurringMonthly, currency))}
                  </p>
                  {doeCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t.finance.recurringPerDoeHint(
                        formatMoney(Math.round(recurringMonthly / doeCount), currency)
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="text-end">
                  <Button
                    size="sm"
                    disabled={recBusy || dueRecurring.length === 0}
                    onClick={handlePostRecurring}
                  >
                    {t.finance.recurringPostButton}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dueRecurring.length === 0
                      ? t.finance.recurringNothingDue
                      : t.finance.recurringDueCount(
                          dueRecurring.length,
                          formatMoney(dueRecurringTotal, currency)
                        )}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recCategory">{locale === "ar" ? "الفئة" : "Category"}</Label>
                <Select
                  items={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
                  value={recCategory}
                  onValueChange={(v) => setRecCategory(v ?? "")}
                  disabled={recBusy}
                >
                  <SelectTrigger id="recCategory">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recAmount">{locale === "ar" ? `المبلغ (${currency})` : `Amount (${currency})`}</Label>
                <Input
                  id="recAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="1500.00"
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  disabled={recBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recDay">{t.finance.recurringDayLabel}</Label>
                <Input
                  id="recDay"
                  type="number"
                  min="1"
                  max="28"
                  value={recDay}
                  onChange={(e) => setRecDay(e.target.value)}
                  disabled={recBusy}
                />
                <p className="text-xs text-muted-foreground">{t.finance.recurringDayHint}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recStart">{t.finance.recurringStartLabel}</Label>
                <Input
                  id="recStart"
                  type="date"
                  value={recStart}
                  onChange={(e) => setRecStart(e.target.value)}
                  disabled={recBusy}
                />
                <p className="text-xs text-muted-foreground">{t.finance.recurringStartHint}</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="recNote">{locale === "ar" ? "ملاحظات" : "Notes"}</Label>
                <Input
                  id="recNote"
                  placeholder="..."
                  value={recNote}
                  onChange={(e) => setRecNote(e.target.value)}
                  disabled={recBusy}
                />
              </div>
            </div>

            <Button onClick={handleAddRecurring} disabled={recBusy} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              {t.finance.recurringAddButton}
            </Button>
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
                      <SortableTh
                        className="px-4 py-3"
                        label={locale === "ar" ? "التاريخ" : "Date"}
                        sortKey="date"
                        activeSortKey={transactionsSort.sortKey}
                        direction={transactionsSort.direction}
                        onSort={transactionsSort.toggleSort}
                      />
                      <SortableTh
                        className="px-4 py-3"
                        label={locale === "ar" ? "النوع" : "Type"}
                        sortKey="type"
                        activeSortKey={transactionsSort.sortKey}
                        direction={transactionsSort.direction}
                        onSort={transactionsSort.toggleSort}
                      />
                      <SortableTh
                        className="px-4 py-3"
                        label={locale === "ar" ? "الفئة" : "Category"}
                        sortKey="category"
                        activeSortKey={transactionsSort.sortKey}
                        direction={transactionsSort.direction}
                        onSort={transactionsSort.toggleSort}
                      />
                      <SortableTh
                        className="px-4 py-3 text-center"
                        label={locale === "ar" ? "المبلغ" : "Amount"}
                        sortKey="amount"
                        activeSortKey={transactionsSort.sortKey}
                        direction={transactionsSort.direction}
                        onSort={transactionsSort.toggleSort}
                      />
                      <SortableTh
                        className="px-4 py-3"
                        label={locale === "ar" ? "البيان" : "Description / Notes"}
                        sortKey="notes"
                        activeSortKey={transactionsSort.sortKey}
                        direction={transactionsSort.direction}
                        onSort={transactionsSort.toggleSort}
                      />
                      <th className="px-4 py-3 w-12 text-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transactionsSort.sorted.map((tr) => (
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
