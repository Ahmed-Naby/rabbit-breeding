"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { TextField, SelectField, type Option } from "@/components/form-fields";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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

export type QuickRabbitRow = {
  id: string;
  sex: string;
  breed: string | null;
  date: string;
  cage: string | null;
  weightKg: number | null;
};

const sexOptions: Option[] = [
  { value: "doe", label: "أنثى" },
  { value: "buck", label: "ذكر" },
];

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
}: {
  rows: QuickRabbitRow[];
  breedOptions: Option[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<QuickRabbitFormState, FormData>(
    createQuickRabbit,
    EMPTY_FORM_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.rabbit) {
      toast.success("تم تسجيل السلالة");
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const e = state.errors ?? {};

  return (
    <div className="space-y-6">
      <form ref={formRef} action={formAction} className="space-y-6">
        {e._form ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {e._form}
          </p>
        ) : null}

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField
              name="sex"
              label="الجنس"
              options={sexOptions}
              defaultValue="doe"
              error={e.sex}
            />
            <TextField
              name="date"
              type="date"
              label="التاريخ"
              required
              defaultValue={toDateInputValue(new Date())}
              error={e.date}
            />
            <SelectField
              name="breed"
              label="النوع"
              options={breedOptions}
              includeNone
              noneLabel="بلا"
              placeholder="اختر النوع…"
              error={e.breed}
            />
          </CardContent>
        </Card>

        <SubmitButton>تسجيل السلالة</SubmitButton>
      </form>

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">التاريخ</TableHead>
                <TableHead className="text-center">الجنس</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">رقم القفص</TableHead>
                <TableHead className="text-center">الوزن</TableHead>
                <TableHead className="text-center"></TableHead>
                <TableHead className="text-center"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell>
                    <LocalDate date={r.date} />
                  </TableCell>
                  <TableCell>{label(r.sex)}</TableCell>
                  <TableCell>{r.breed ?? "—"}</TableCell>
                  <FinalizeRowCells id={r.id} sex={r.sex} cage={r.cage} weightKg={r.weightKg} />
                  <TableCell>
                    <DeleteRabbitButton id={r.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
}: {
  id: string;
  sex: string;
  cage: string | null;
  weightKg: number | null;
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
          placeholder="رقم القفص"
          defaultValue={cage ?? undefined}
          disabled={cagePending}
          onBlur={(ev) => {
            const value = ev.target.value.trim();
            if (!value) return;
            startCage(async () => {
              const result = await saveQuickRabbitCage(id, value);
              if (result.ok) {
                setCageError(null);
                toast.success("تم حفظ رقم القفص");
                router.refresh();
              } else {
                setCageError(result.message ?? "رقم قفص غير صالح");
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
          placeholder="كجم"
          defaultValue={weightKg ?? undefined}
          disabled={weightPending}
          onBlur={(ev) => {
            const value = ev.target.value;
            if (!value) return;
            startWeight(async () => {
              const result = await saveQuickRabbitWeight(id, Number(value));
              if (result.ok) {
                setWeightError(null);
                toast.success("تم حفظ الوزن");
                router.refresh();
              } else {
                setWeightError(result.message ?? "وزن غير صالح");
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
        <PromoteButton id={id} sex={sex} />
      </TableCell>
    </>
  );
}

function PromoteButton({ id, sex }: { id: string; sex: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = sex === "buck" ? "نقل إلى عنبر الذكور" : "نقل إلى عنبر الأمهات";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await promoteToHerdPen(id);
          if (result.ok) {
            toast.success("تم النقل");
            router.refresh();
          } else {
            toast.error(result.message ?? "تعذر النقل");
          }
        })
      }
      className="h-7 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
    >
      {label}
    </button>
  );
}
