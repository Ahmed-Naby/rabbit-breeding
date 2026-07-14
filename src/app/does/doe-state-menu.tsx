"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOE_STATES, label, type DoeState } from "@/lib/enums";
import { toDateInputValue } from "@/lib/dates";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import {
  markMated,
  markMatingFailed,
  markKindled,
  markWeaned,
  setMatingDate,
  setLitterCount,
  setLitterWeaningWeight,
  clearDoeRow,
  startBreeding,
  buckExists,
  confirmPregnant,
  installNestBox,
} from "../breedings/actions";

const BADGE_CLS: Record<DoeState, string> = {
  empty: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  bred: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  pregnant:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  nursing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  nursing_bred:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  nursing_pregnant:
    "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  excluded: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function DoeStateBadge({ current, locale }: { current: string; locale: Locale }) {
  const state = (DOE_STATES.includes(current as DoeState) ? current : "empty") as DoeState;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        BADGE_CLS[state]
      )}
    >
      {label(state, locale)}
    </span>
  );
}

/**
 * "عشار" (confirm positive pregnancy test) column. This is the only place
 * this component is used, so it always writes through confirmPregnant —
 * which, unlike a plain doeState flip, also snapshots the result into the
 * permanent PregnancyTestLog (سجل الجس) before the underlying breeding row
 * can be reused/overwritten by a later mating.
 */
export function DoeActionButton({
  id,
  breedingId,
  text,
  target,
  className,
  disabled,
  checked,
  locale,
}: {
  id: string;
  breedingId: string;
  text: string;
  target: DoeState;
  className?: string;
  disabled?: boolean;
  /** Already reached this state — show a checkmark instead of hiding the button. */
  checked?: boolean;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  if (checked) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center text-emerald-600 dark:text-emerald-400">
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
      className={cn("h-7 px-2 text-xs", className)}
      onClick={() =>
        startTransition(async () => {
          await confirmPregnant(breedingId, id, target);
          toast.success(t.stateSetToast(label(target, locale)));
        })
      }
    >
      {text}
    </Button>
  );
}

/**
 * "تلقيح" column: the mate button and the buck-tag input as one coordinated
 * unit, since the typed tag only gets saved at the moment "تلقيح" is
 * pressed — there's no independent save-on-blur. While waiting for a new
 * cycle (`canMate`), the input is empty and editable; typing a number here
 * doesn't touch the server on its own, it's just staged locally until the
 * button submits it together with today's mating date. Once mated, the
 * button becomes a checkmark and the input freezes showing the recorded
 * number (or blank if none was given) — it only unfreezes, and clears back
 * to the placeholder, once a new cycle makes `canMate` true again.
 *
 * A buck number is required: the button stays disabled until the typed tag
 * is checked (debounced, so it's not one request per keystroke) and found
 * to match a real buck — this replaced an earlier "mate now, warn after"
 * design where the doe's row could vanish (mated boards drop her once she's
 * no longer "ready") before anyone saw the warning that the buck didn't match.
 *
 * `breedingId` is null for a doe with no breeding row yet (just reached
 * mating weight, never bred before) — the first "تلقيح" click creates that
 * row via `startBreeding`; afterward `markMated` reuses or forks it.
 */
export function MateCell({
  breedingId,
  doeId,
  canMate,
  buckTagId,
  locale,
}: {
  breedingId: string | null;
  doeId: string;
  canMate: boolean;
  buckTagId: string | null;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(() => (canMate ? "" : (buckTagId ?? "")));
  const [valid, setValid] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setValue(canMate ? "" : (buckTagId ?? ""));
    setValid(false);
    setChecking(false);
  }, [canMate, buckTagId]);

  // Debounced live check of whatever's currently typed, so the button only
  // ever becomes clickable once the tag is confirmed to match a real buck.
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
      const found = await buckExists(tag);
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
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        {canMate ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || checking || !valid}
            className="h-7 px-2 text-xs border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
            onClick={() =>
              startTransition(async () => {
                const buckTag = value.trim();
                // Re-checked at submit time as a safety net against a buck
                // being removed in the moment between the debounced check and
                // the click; the disabled state above covers the normal case.
                if (!buckTag || !(await buckExists(buckTag))) {
                  setValid(false);
                  toast.error(t.buckNotFoundToast(buckTag));
                  return;
                }
                if (breedingId) {
                  await markMated(breedingId, doeId, buckTag);
                } else {
                  await startBreeding(doeId, buckTag);
                }
                toast.success(t.matedTodayToast);
              })
            }
          >
            {t.mateButton}
          </Button>
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center text-emerald-600 dark:text-emerald-400">
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
            "h-7 w-20 rounded-md border bg-transparent px-1.5 text-center text-xs disabled:opacity-50",
            showInvalid ? "border-red-400 dark:border-red-700" : "border-input"
          )}
        />
      </div>
      {showInvalid ? (
        <span className="text-[10px] leading-tight text-red-600 dark:text-red-400">
          {t.tagNotFound(value.trim())}
        </span>
      ) : null}
    </div>
  );
}

/**
 * "ولادة": a three-way status button rather than a plain enabled/disabled
 * one. Red + clickable (value 0) while pregnant and kindling hasn't been
 * recorded yet; green + disabled (value 1) once she's nursing, showing
 * kindling was already recorded for this cycle; hidden otherwise, when
 * kindling isn't relevant to her current state.
 */
export function KindleButton({
  breedingId,
  doeId,
  text,
  doeState,
  locale,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  doeState: DoeState;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  const active = doeState === "pregnant" || doeState === "nursing_pregnant";
  const pressed = doeState === "nursing" || doeState === "nursing_bred";

  if (!active && !pressed) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || !active}
      className={cn(
        "h-7 px-2 text-xs",
        active &&
          "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900",
        pressed &&
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      )}
      onClick={() =>
        startTransition(async () => {
          await markKindled(breedingId, doeId);
          toast.success(t.kindledToast);
        })
      }
    >
      {text}
    </Button>
  );
}

/**
 * "تركيب بيت الولادة": one-shot action for the /nest-box board — stamps
 * today as the installation date via installNestBox. Unlike KindleButton/
 * WeanButton this isn't a three-way toggle: the board itself only ever lists
 * does whose nest box isn't installed yet for the current cycle (see
 * nest-box/page.tsx), so once pressed the row simply drops off the list on
 * the next revalidation instead of needing a "pressed" visual state here.
 */
export function InstallNestBoxButton({
  breedingId,
  doeId,
  locale,
}: {
  breedingId: string;
  doeId: string;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-7 px-2 text-xs border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
      onClick={() =>
        startTransition(async () => {
          await installNestBox(breedingId, doeId);
          toast.success(t.nestBoxInstalledToast);
        })
      }
    >
      {t.installButton}
    </Button>
  );
}

/**
 * "فطام": a three-way status button, same idea as "ولادة". Red + clickable
 * (value 0) while she still has an unweaned litter; green + disabled (value
 * 1) once weaningDate is set for this row's litter; hidden otherwise, when
 * weaning isn't relevant to her current state. `active` is passed in rather
 * than derived from doeState here, since a doe can still have an unweaned
 * litter even after doeState has moved on to "pregnant" (rebred while
 * nursing, then confirmed pregnant before weaning the old litter).
 */
export function WeanButton({
  breedingId,
  doeId,
  text,
  active,
  weaned,
  locale,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  active: boolean;
  weaned: boolean;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();

  if (!active && !weaned) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || !active}
      className={cn(
        "h-7 px-2 text-xs",
        active &&
          "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900",
        weaned &&
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      )}
      onClick={() =>
        startTransition(async () => {
          await markWeaned(breedingId, doeId);
          toast.success(t.weanedTodayToast);
        })
      }
    >
      {text}
    </Button>
  );
}

/** "تاريخ التلقيح": editable by hand (e.g. logged a day late), not just set via "تلقيح". */
export function MatingDateInput({
  breedingId,
  date,
  locale,
}: {
  breedingId: string;
  date: string | Date | null;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(() =>
    toDateInputValue(date ? new Date(date) : null)
  );

  // Keep the field in sync when the server sets/clears the date out from under
  // it (e.g. clicking "تلقيح"/"فشل التلقيح") — an uncontrolled input wouldn't
  // pick up a new `date` prop after the initial mount.
  useEffect(() => {
    setValue(toDateInputValue(date ? new Date(date) : null));
  }, [date]);

  return (
    <input
      type="date"
      value={value}
      disabled={pending}
      className="h-7 w-38 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
      onChange={(e) => {
        setValue(e.target.value);
        startTransition(async () => {
          await setMatingDate(breedingId, e.target.value);
          toast.success(t.matingDateUpdatedToast);
        });
      }}
    />
  );
}

/** "حي" / "نافق" / "عدد الفطام": editable litter counts, committed on blur. */
export function LitterCountInput({
  breedingId,
  field,
  value,
  disabled,
  locale,
  className,
}: {
  breedingId: string;
  field: "bornAlive" | "bornDead" | "weaned";
  value: number | null;
  disabled?: boolean;
  locale: Locale;
  className?: string;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
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
        "h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50",
        className
      )}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        const parsed = e.target.value === "" ? null : Number(e.target.value);
        if (parsed === value) return;
        startTransition(async () => {
          const result = await setLitterCount(breedingId, field, parsed);
          if (!result.ok) {
            toast.error(result.message ?? t.invalidValueFallback);
            setText((value ?? "").toString());
          }
        });
      }}
    />
  );
}

/** "الوزن (جم)": total litter weight in grams at weaning, committed on blur. */
export function LitterWeightInput({
  breedingId,
  valueGrams,
  disabled,
  locale,
  className,
}: {
  breedingId: string;
  valueGrams: number | null;
  disabled?: boolean;
  locale: Locale;
  className?: string;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
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
        "h-7 w-20 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50",
        className
      )}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        const parsed = e.target.value === "" ? null : Number(e.target.value);
        if (parsed === valueGrams) return;
        if (parsed !== null && Number.isNaN(parsed)) return;
        startTransition(async () => {
          const result = await setLitterWeaningWeight(breedingId, parsed);
          if (!result.ok) {
            toast.error(result.message ?? t.invalidValueFallback);
            setText((valueGrams ?? "").toString());
          }
        });
      }}
    />
  );
}

/**
 * "مسح": destructive reset of this doe's row (mating date, kindling date,
 * litter counts/dates) back to "فاضية". Confirmed with a warning before
 * running since it's not reversible.
 */
export function ClearDoeButton({
  breedingId,
  doeId,
  text,
  locale,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="h-7 px-2 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
      onClick={() => {
        const confirmed = window.confirm(t.clearConfirm);
        if (!confirmed) return;
        startTransition(async () => {
          await clearDoeRow(breedingId, doeId);
          toast.success(t.clearedToast);
        });
      }}
    >
      {text}
    </Button>
  );
}

/** "فشل التلقيح": clears the mating date (and derived test/kindling dates) on the row. */
export function MatingFailedButton({
  breedingId,
  doeId,
  text,
  className,
  disabled,
  locale,
}: {
  breedingId: string;
  doeId: string;
  text: string;
  className?: string;
  disabled?: boolean;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).doeStateMenu;
  const [pending, startTransition] = useTransition();
  if (disabled) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className={cn("h-7 px-2 text-xs", className)}
      onClick={() =>
        startTransition(async () => {
          await markMatingFailed(breedingId, doeId);
          toast.success(t.matingFailedToast);
        })
      }
    >
      {text}
    </Button>
  );
}


