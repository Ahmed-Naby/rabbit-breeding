"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { Field, TextField, SelectField, type Option } from "@/components/form-fields";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import { label } from "@/lib/enums";
import {
  createQuickRabbit,
  saveQuickRabbitCage,
  saveQuickRabbitWeight,
  promoteToHerdPen,
  type QuickRabbitFormState,
} from "./actions";
import { DeleteRabbitButton } from "./delete-rabbit-button";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

export type QuickRabbitRow = {
  id: string;
  sex: string;
  breed: string | null;
  date: string;
  cage: string | null;
  weightKg: number | null;
};

/**
 * Fast intake: sex + date + breed in one row, covering both does and bucks in
 * a single shared table (their tag numbers stay independent sequences —
 * @@unique([tagId, sex]) — but that's an implementation detail, not a reason
 * to split the UI). Cage/weight are left for the row cells below (see
 * FinalizeRowCells), not asked for here — a rabbit registered this way starts
 * as a tagId-less "سلالة" and stays in this nursery pen, often for months,
 * with its cage and weight each autosaving independently as soon as entered.
 * Only the explicit "نقل إلى العنبر" button moves it on to /mothers or /bucks
 * for its real tagId (see promoteToHerdPen / finalizeMother / finalizeBuck) —
 * never automatically just because cage/weight got filled in. Doesn't
 * navigate away after saving, so several rabbits can be added back-to-back;
 * `rows` is fetched server-side so the table survives a page refresh.
 */
export function QuickRabbitForm({
  rows,
  breedOptions,
  t,
  tCommon,
  locale,
}: {
  rows: QuickRabbitRow[];
  breedOptions: Option[];
  t: Dictionary["stock"];
  tCommon: Dictionary["common"];
  locale: Locale;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<QuickRabbitFormState, FormData>(
    createQuickRabbit,
    EMPTY_FORM_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);
  const cageRef = useRef<HTMLInputElement>(null);
  // Computed once (not inline in JSX) so it stays stable across re-renders —
  // Base UI's uncontrolled Input warns if defaultValue changes after mount.
  const [today] = useState(() => toDateInputValue(new Date()));

  useEffect(() => {
    if (state.ok && state.rabbit) {
      const cage = cageRef.current?.value.trim();
      const rabbitId = state.rabbit.id;
      toast.success(t.registeredToast);
      formRef.current?.reset();
      if (cage) {
        void saveQuickRabbitCage(rabbitId, cage).then((result) => {
          if (!result.ok) {
            toast.error(result.message ?? t.invalidCageFallback);
          }
          router.refresh();
        });
      } else {
        router.refresh();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const e = state.errors ?? {};
  const sexOptions: Option[] = [
    { value: "doe", label: t.sexDoe },
    { value: "buck", label: t.sexBuck },
  ];

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} className="space-y-6">
        {e._form ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {e._form}
          </p>
        ) : null}

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField
              name="sex"
              label={t.sexLabel}
              options={sexOptions}
              defaultValue="doe"
              error={e.sex}
            />
            <TextField
              name="date"
              type="date"
              label={t.dateLabel}
              required
              defaultValue={today}
              error={e.date}
            />
            <SelectField
              name="breed"
              label={t.breedLabel}
              options={breedOptions}
              includeNone
              noneLabel={tCommon.none}
              placeholder={tCommon.selectPlaceholder}
              error={e.breed}
            />
            <TextField
              name="weightKg"
              type="number"
              step="0.001"
              min={0}
              label={t.weightLabel}
              placeholder={t.weightPlaceholder}
              error={e.weightKg}
            />
            <Field label={t.cageLabel} htmlFor="cage">
              <input
                ref={cageRef}
                id="cage"
                type="text"
                maxLength={10}
                placeholder={t.cagePlaceholder}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />
            </Field>
          </CardContent>
        </Card>

        <SubmitButton>{t.submitButton}</SubmitButton>
      </form>

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "date", label: t.colDate, type: "date", className: "text-center" },
              { key: "sex", label: t.colSex, type: "string", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "text-center" },
              { key: "cage", label: t.colCage, type: "tag", className: "text-center" },
              { key: "weight", label: t.colWeight, type: "number", className: "text-center" },
              { key: "promote", label: "", className: "text-center", sortable: false },
              { key: "delete", label: "", className: "text-center", sortable: false },
            ]}
            rows={rows.map((r) => ({
              key: r.id,
              sortValues: { date: r.date, sex: r.sex, breed: r.breed, cage: r.cage, weight: r.weightKg },
              node: (
                <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell>
                    <Link href={`/rabbits/${r.id}`} className="hover:underline">
                      <LocalDate date={r.date} locale={locale} />
                    </Link>
                  </TableCell>
                  <TableCell>{label(r.sex, locale)}</TableCell>
                  <TableCell>{r.breed ?? "—"}</TableCell>
                  <FinalizeRowCells id={r.id} sex={r.sex} cage={r.cage} weightKg={r.weightKg} t={t} />
                  <TableCell>
                    <DeleteRabbitButton id={r.id} t={t} />
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * رقم القفص and weight each autosave independently on blur, instead of
 * sharing one combined submit — typing a value used to be silently lost if
 * the user navigated away before "finishing". Neither field moves the row
 * off /stock by itself; the separate "نقل إلى العنبر" button (see
 * PromoteButton) is the only thing that does, since a سلالة is meant to stay
 * in this nursery pen for a while (often months) before being moved on.
 */
function FinalizeRowCells({
  id,
  sex,
  cage,
  weightKg,
  t,
}: {
  id: string;
  sex: string;
  cage: string | null;
  weightKg: number | null;
  t: Dictionary["stock"];
}) {
  const router = useRouter();
  const [cagePending, startCage] = useTransition();
  const [weightPending, startWeight] = useTransition();
  const [cageError, setCageError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);

  return (
    <>
      <TableCell>
        <input
          type="text"
          name="cage"
          maxLength={10}
          placeholder={t.cagePlaceholder}
          defaultValue={cage ?? undefined}
          disabled={cagePending}
          onBlur={(ev) => {
            const value = ev.target.value.trim();
            if (!value) return;
            startCage(async () => {
              const result = await saveQuickRabbitCage(id, value);
              if (result.ok) {
                setCageError(null);
                toast.success(t.cageSavedToast);
                router.refresh();
              } else {
                setCageError(result.message ?? t.invalidCageFallback);
              }
            });
          }}
          className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
        />
        {cageError ? (
          <p className="mt-1 text-[10px] text-destructive">{cageError}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <input
          type="number"
          name="weightKg"
          step="0.001"
          min={0}
          placeholder={t.weightPlaceholder}
          defaultValue={weightKg ?? undefined}
          disabled={weightPending}
          onBlur={(ev) => {
            const value = ev.target.value;
            if (!value) return;
            startWeight(async () => {
              const result = await saveQuickRabbitWeight(id, Number(value));
              if (result.ok) {
                setWeightError(null);
                toast.success(t.weightSavedToast);
                router.refresh();
              } else {
                setWeightError(result.message ?? t.invalidWeightFallback);
              }
            });
          }}
          className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
        />
        {weightError ? (
          <p className="mt-1 text-[10px] text-destructive">{weightError}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <PromoteButton id={id} sex={sex} t={t} />
      </TableCell>
    </>
  );
}

function PromoteButton({ id, sex, t }: { id: string; sex: string; t: Dictionary["stock"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const promoteLabel = sex === "buck" ? t.promoteToBuckLine : t.promoteToDoeLine;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await promoteToHerdPen(id);
          if (result.ok) {
            toast.success(t.movedToast);
            router.refresh();
          } else {
            toast.error(result.message ?? t.moveFailedFallback);
          }
        })
      }
      className="h-7 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
    >
      {promoteLabel}
    </button>
  );
}
