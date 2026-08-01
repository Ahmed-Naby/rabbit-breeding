"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
      ) : null}
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  error,
  required,
  hint,
  className,
  badge,
  ...props
}: React.ComponentProps<typeof Input> & {
  label?: string;
  error?: string;
  hint?: string;
  /** Optional read-only chip beside the input — what the typed value means. */
  badge?: React.ReactNode;
}) {
  const input = <Input id={name} name={name} aria-invalid={!!error} {...props} />;
  return (
    <Field
      label={label}
      htmlFor={name}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      {badge ? (
        // Wraps rather than squeezing: the badges sit beside the box on a wide
        // screen and drop under it in a narrow column, instead of shrinking the
        // input until the number itself is unreadable.
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-24 flex-1">{input}</div>
          {badge}
        </div>
      ) : (
        input
      )}
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  label?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint} className={className}>
      <Textarea id={name} name={name} aria-invalid={!!error} {...props} />
    </Field>
  );
}

export type Option = { value: string; label: string };

/**
 * Styled select that mirrors its value into a hidden input so it submits with
 * native FormData. Supports an optional "none" choice for nullable FKs.
 */
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  placeholder,
  error,
  required,
  hint,
  includeNone,
  noneLabel,
  className,
  onValueChange,
}: {
  name: string;
  label?: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  includeNone?: boolean;
  noneLabel?: string;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const NONE = "__none__";
  const [value, setValue] = React.useState(defaultValue ?? "");

  const items = [
    ...(includeNone ? [{ value: NONE, label: noneLabel }] : []),
    ...options.map((opt) => ({ value: opt.value, label: opt.label })),
  ];

  return (
    <Field
      label={label}
      htmlFor={name}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <input type="hidden" name={name} value={value} />
      <Select
        // Without items the trigger has no value -> label map and renders the
        // raw value, so وحدة الوزن read "kg" and نظام إعادة التلقيح read "0".
        items={items}
        value={value === "" ? NONE : value}
        onValueChange={(v: string | null) => {
          const next = v === NONE || v == null ? "" : v;
          setValue(next);
          onValueChange?.(next);
        }}
      >
        <SelectTrigger id={name} className="w-full" aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeNone ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
