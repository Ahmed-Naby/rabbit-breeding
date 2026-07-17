/**
 * Mobile-adapted equivalents of src/app/does/doe-state-menu.tsx's action
 * atoms — same states, same color semantics, same toasts, but writing
 * through outbox.enqueue() (local-first, queued for replay) instead of a
 * Server Action, and a touch-friendly card layout instead of dense table
 * cells (see does-page.tsx). Every control calls `onDone` after enqueueing
 * so the page can refetch from the local mirror and reflect the optimistic
 * update immediately — this bundle has no revalidatePath equivalent.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOE_STATES, label, type DoeState, type RabbitStatus } from "@/lib/enums";
import { toDateInputValue } from "@/lib/dates";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import { enqueue } from "../sync/outbox";
import { getDb } from "../db/client";
import { buckExistsLocally } from "../db/queries";

const BADGE_CLS: Record<DoeState, string> = {
  empty: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  bred: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  pregnant: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  nursing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  nursing_bred: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  nursing_pregnant: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  excluded: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function DoeStateBadge({ current, locale }: { current: string; locale: Locale }) {
  const state = (DOE_STATES.includes(current as DoeState) ? current : "empty") as DoeState;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", BADGE_CLS[state])}>
      {label(state, locale)}
    </span>
  );
}

/**
 * Manual herd-status override — independent of the reproductive cycle state
 * (mate/pregnant/kindle/wean, shown by DoeStateBadge above). Writes through
 * the existing setRabbitStatus op, same field/op the herd StatusBadge reads.
 */
export function DoeAvailabilityToggle({
  id,
  current,
  locale,
  onDone,
}: {
  id: string;
  current: string;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState<RabbitStatus | null>(null);

  const options: { status: RabbitStatus; text: string; activeCls: string }[] = [
    {
      status: "active",
      text: locale === "ar" ? "نشط" : "Active",
      activeCls:
        "border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      status: "culled",
      text: locale === "ar" ? "استبعاد" : "Excluded",
      activeCls:
        "border-red-400 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
    },
    {
      status: "resting",
      text: locale === "ar" ? "راحة" : "Resting",
      activeCls:
        "border-orange-400 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300",
    },
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {options.map((opt) => {
        const isActive = current === opt.status;
        return (
          <Button
            key={opt.status}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending !== null}
            className={cn("h-7 px-2 text-[11px]", isActive && opt.activeCls)}
            onClick={async () => {
              if (isActive) return;
              if (opt.status === "culled" && !window.confirm(t.cullConfirm)) return;
              setPending(opt.status);
              await enqueue("setRabbitStatus", { id, status: opt.status });
              toast.success(t.stateSetToast(label(opt.status, locale)));
              setPending(null);
              onDone();
            }}
          >
            {opt.text}
          </Button>
        );
      })}
    </div>
  );
}

/** "Pregnant" confirm button — the only place this writes, so it always goes through confirmPregnant. */
export function DoeActionButton({
  id,
  breedingId,
  text,
  target,
  className,
  disabled,
  checked,
  locale,
  onDone,
}: {
  id: string;
  breedingId: string;
  text: string;
  target: DoeState;
  className?: string;
  disabled?: boolean;
  checked?: boolean;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  if (checked) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center text-emerald-600 dark:text-emerald-400">
        <Check className="h-4 w-4" />
      </span>
    );
  }
  if (disabled) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className={cn("h-8 px-2.5 text-xs", className)}
      onClick={async () => {
        setPending(true);
        await enqueue("confirmPregnant", { breedingId, doeId: id, target });
        toast.success(t.stateSetToast(label(target, locale)));
        setPending(false);
        onDone();
      }}
    >
      {text}
    </Button>
  );
}

/**
 * Mate button + buck-tag input as one unit — same behavior as the web
 * version's MateCell, but the buck-tag check reads the local mirror instead
 * of hitting the server (see buckExistsLocally above).
 */
export function MateCell({
  breedingId,
  doeId,
  canMate,
  buckTagId,
  locale,
  onDone,
}: {
  breedingId: string | null;
  doeId: string;
  canMate: boolean;
  buckTagId: string | null;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(() => (canMate ? "" : (buckTagId ?? "")));
  const [valid, setValid] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setValue(canMate ? "" : (buckTagId ?? ""));
    setValid(false);
    setChecking(false);
  }, [canMate, buckTagId]);

  useEffect(() => {
    if (!canMate) return;
    const tag = value.trim();
    if (!tag) {
      setValid(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await buckExistsLocally(await getDb(), tag);
      if (!cancelled) {
        setValid(found);
        setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, canMate]);

  const showInvalid = canMate && !checking && value.trim() !== "" && !valid;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
        {canMate ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || checking || !valid}
            className="h-8 px-2.5 text-xs border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
            onClick={async () => {
              const buckTag = value.trim();
              if (!buckTag || !(await buckExistsLocally(await getDb(), buckTag))) {
                setValid(false);
                toast.error(t.buckNotFoundToast(buckTag));
                return;
              }
              setPending(true);
              if (breedingId) {
                await enqueue("markMated", { breedingId, doeId, buckTagId: buckTag });
              } else {
                await enqueue("startBreeding", { doeId, buckTagId: buckTag });
              }
              toast.success(t.matedTodayToast);
              setPending(false);
              onDone();
            }}
          >
            {t.mateButton}
          </Button>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
          </span>
        )}
        <input
          type="text"
          inputMode="numeric"
          placeholder={t.buckTagPlaceholder}
          value={value}
          disabled={!canMate || pending}
          onChange={(e) => setValue(e.target.value)}
          className={cn(
            "h-8 w-20 rounded-md border bg-transparent px-1.5 text-center text-xs disabled:opacity-50",
            showInvalid ? "border-red-400 dark:border-red-700" : "border-input"
          )}
        />
      </div>
      {showInvalid ? (
        <span className="text-[10px] leading-tight text-red-600 dark:text-red-400">{t.tagNotFound(value.trim())}</span>
      ) : null}
    </div>
  );
}

export function KindleButton({
  breedingId,
  doeId,
  text,
  doeState,
  locale,
  onDone,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  doeState: DoeState;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  const active = doeState === "pregnant" || doeState === "nursing_pregnant";
  const pressed = doeState === "nursing" || doeState === "nursing_bred";

  if (!active && !pressed) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || !active}
      className={cn(
        "h-8 px-2.5 text-xs",
        active &&
          "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900",
        pressed &&
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      )}
      onClick={async () => {
        setPending(true);
        await enqueue("markKindled", { breedingId, doeId });
        toast.success(t.kindledToast);
        setPending(false);
        onDone();
      }}
    >
      {text}
    </Button>
  );
}

export function WeanButton({
  breedingId,
  doeId,
  text,
  active,
  weaned,
  locale,
  onDone,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  active: boolean;
  weaned: boolean;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);

  if (!active && !weaned) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || !active}
      className={cn(
        "h-8 px-2.5 text-xs",
        active &&
          "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900",
        weaned &&
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      )}
      onClick={async () => {
        setPending(true);
        await enqueue("markWeaned", { breedingId, doeId });
        toast.success(t.weanedTodayToast);
        setPending(false);
        onDone();
      }}
    >
      {text}
    </Button>
  );
}

export function MatingDateInput({
  breedingId,
  date,
  locale,
  onDone,
}: {
  breedingId: string;
  date: Date | null;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(() => toDateInputValue(date));

  useEffect(() => {
    setValue(toDateInputValue(date));
  }, [date]);

  return (
    <input
      type="date"
      value={value}
      disabled={pending}
      className="h-8 w-36 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
      onChange={async (e) => {
        setValue(e.target.value);
        setPending(true);
        await enqueue("setMatingDate", { breedingId, matingDate: e.target.value || null });
        toast.success(t.matingDateUpdatedToast);
        setPending(false);
        onDone();
      }}
    />
  );
}

export function LitterCountInput({
  breedingId,
  field,
  value,
  disabled,
  locale,
  className,
  onDone,
}: {
  breedingId: string;
  field: "bornAlive" | "bornDead" | "weaned";
  value: number | null;
  disabled?: boolean;
  locale: Locale;
  className?: string;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  const [text, setText] = useState(() => (value ?? "").toString());

  useEffect(() => {
    setText((value ?? "").toString());
  }, [value]);

  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={text}
      disabled={pending || disabled}
      className={cn(
        "h-8 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50",
        className
      )}
      onChange={(e) => setText(e.target.value)}
      onBlur={async (e) => {
        const parsed = e.target.value === "" ? null : Number(e.target.value);
        if (parsed === value) return;
        setPending(true);
        const { outcome } = await enqueue("setLitterCount", { breedingId, field, value: parsed });
        if (outcome.status === "rejected") {
          toast.error(outcome.resultMessage || t.invalidValueFallback);
          setText((value ?? "").toString());
        }
        setPending(false);
        onDone();
      }}
    />
  );
}

export function ClearDoeButton({
  breedingId,
  doeId,
  text,
  locale,
  onDone,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-8 px-2.5 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
      onClick={async () => {
        const confirmed = window.confirm(t.clearConfirm);
        if (!confirmed) return;
        setPending(true);
        await enqueue("clearDoeRow", { breedingId, doeId });
        toast.success(t.clearedToast);
        setPending(false);
        onDone();
      }}
    >
      {text}
    </Button>
  );
}

export function MatingFailedButton({
  breedingId,
  doeId,
  text,
  className,
  disabled,
  locale,
  onDone,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  className?: string;
  disabled?: boolean;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  if (disabled) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className={cn("h-8 px-2.5 text-xs", className)}
      onClick={async () => {
        setPending(true);
        await enqueue("markMatingFailed", { breedingId, doeId });
        toast.success(t.matingFailedToast);
        setPending(false);
        onDone();
      }}
    >
      {text}
    </Button>
  );
}

export function InstallNestBoxButton({
  breedingId,
  doeId,
  locale,
  onDone,
}: {
  breedingId: string;
  doeId: string;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-8 px-2.5 text-xs border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
      onClick={async () => {
        setPending(true);
        await enqueue("installNestBox", { breedingId, doeId });
        toast.success(t.nestBoxInstalledToast);
        setPending(false);
        onDone();
      }}
    >
      {t.installButton}
    </Button>
  );
}

export function LitterWeightInput({
  breedingId,
  valueGrams,
  disabled,
  locale,
  className,
  onDone,
}: {
  breedingId: string;
  valueGrams: number | null;
  disabled?: boolean;
  locale: Locale;
  className?: string;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, setPending] = useState(false);
  const [text, setText] = useState(() => (valueGrams ?? "").toString());

  useEffect(() => {
    setText((valueGrams ?? "").toString());
  }, [valueGrams]);

  return (
    <input
      type="number"
      min={0}
      step="1"
      inputMode="numeric"
      value={text}
      disabled={pending || disabled}
      className={cn(
        "h-8 w-20 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50",
        className
      )}
      onChange={(e) => setText(e.target.value)}
      onBlur={async (e) => {
        const parsed = e.target.value === "" ? null : Number(e.target.value);
        if (parsed === valueGrams) return;
        if (parsed !== null && Number.isNaN(parsed)) return;
        setPending(true);
        const { outcome } = await enqueue("setLitterWeaningWeight", { breedingId, weaningWeightGrams: parsed });
        if (outcome.status === "rejected") {
          toast.error(outcome.resultMessage || t.invalidValueFallback);
          setText((valueGrams ?? "").toString());
        }
        setPending(false);
        onDone();
      }}
    />
  );
}
