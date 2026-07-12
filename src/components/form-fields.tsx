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
  ...props
}: React.ComponentProps<typeof Input> & {
  label?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <Field
      label={label}
      htmlFor={name}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      <Input id={name} name={name} aria-invalid={!!error} {...props} />
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
